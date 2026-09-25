import * as Location from 'expo-location';

// Kathmandu Valley — same box the backend validates (backend/app/modules/listings/schemas.py)
export const VALLEY = { minLat: 27.55, maxLat: 27.85, minLng: 85.15, maxLng: 85.56 };
export const KATHMANDU = { lat: 27.7, lng: 85.33 };

export function insideValley(lat: number, lng: number) {
  return lat >= VALLEY.minLat && lat <= VALLEY.maxLat && lng >= VALLEY.minLng && lng <= VALLEY.maxLng;
}

export function clampToValley(lat: number, lng: number) {
  return {
    lat: Math.min(Math.max(lat, VALLEY.minLat), VALLEY.maxLat),
    lng: Math.min(Math.max(lng, VALLEY.minLng), VALLEY.maxLng),
  };
}

/** Returns the phone's position, or null if the user said no. */
export async function getMyLocation(): Promise<{ lat: number; lng: number } | null> {
  const { granted } = await Location.requestForegroundPermissionsAsync();
  if (!granted) return null;
  const last = await Location.getLastKnownPositionAsync({ maxAge: 60_000 });
  const pos = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}
