// Photo upload: pick → shrink to JPEG → the backend's 3-step upload.
//
// Why shrink? iPhone photos are 3–6 MB HEIC files. We convert every photo to a
// ~1600px JPEG (usually 200–500 KB): faster uploads on Nepali mobile data, and the
// backend only accepts JPEG/PNG/WebP anyway.
//
// Why FileSystem.uploadAsync instead of fetch()? Sending a file with fetch() in React
// Native is unreliable (headers/body can change on the way). uploadAsync is the native
// uploader: it streams the exact file bytes with the exact headers — which presigned
// Cloudflare R2 / S3 URLs also require in production.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';

import { api, ApiError } from './api';
import type { Listing } from './types';

const MAX_WIDTH = 1600;

type Ticket = { photo_id: string; upload_url: string; method: string; headers: Record<string, string> };

export async function pickPhotos(maxCount: number): Promise<string[] | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error('photos-permission');

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: maxCount,
    quality: 1, // we compress ourselves below
  });
  if (result.canceled) return null;
  return result.assets.map((a) => a.uri);
}

export async function takePhoto(): Promise<string | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new Error('camera-permission');
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  return result.canceled ? null : result.assets[0].uri;
}

async function toJpeg(uri: string): Promise<string> {
  const context = ImageManipulator.manipulate(uri).resize({ width: MAX_WIDTH });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  return saved.uri;
}

/** Pulls FastAPI's {"detail": "..."} out of a raw response body. */
function detailFrom(body: string, status: number): string {
  try {
    const detail = JSON.parse(body)?.detail;
    if (typeof detail === 'string') return detail;
  } catch {
    // not JSON (e.g. an S3/R2 XML error)
  }
  return `Upload failed (${status})`;
}

/** Uploads one photo and returns the updated listing. */
export async function uploadPhoto(listingId: string, localUri: string): Promise<Listing> {
  const jpegUri = await toJpeg(localUri);
  const info = await FileSystem.getInfoAsync(jpegUri);
  if (!info.exists) throw new Error('Could not read the photo');

  // 1) ask the API where to upload
  const ticket = await api<Ticket>(`/listings/${listingId}/photos/upload-url`, {
    method: 'POST',
    body: { content_type: 'image/jpeg', size_bytes: info.size },
  });

  // If anything below fails, free the photo slot so the owner can simply try again.
  const discard = () => api(`/listings/${listingId}/photos/${ticket.photo_id}`, { method: 'DELETE' }).catch(() => {});

  try {
    // 2) upload the bytes (local dev: to our API; production: straight to Cloudflare R2)
    const res = await FileSystem.uploadAsync(ticket.upload_url, jpegUri, {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: ticket.headers,
    });
    if (res.status < 200 || res.status >= 300) throw new ApiError(res.status, detailFrom(res.body, res.status));

    // 3) tell the API it's done
    return await api<Listing>(`/listings/${listingId}/photos/${ticket.photo_id}/complete`, { method: 'POST' });
  } catch (err) {
    await discard();
    throw err;
  } finally {
    FileSystem.deleteAsync(jpegUri, { idempotent: true }).catch(() => {}); // remove the temp JPEG
  }
}
