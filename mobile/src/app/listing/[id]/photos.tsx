import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useDeletePhoto, useListing, useListingAction, useReorderPhotos } from '../../../api/hooks';
import { Button, ErrorView, Loading, useErrorText } from '../../../components/ui';
import { colors, radius, space } from '../../../lib/theme';
import { pickPhotos, takePhoto, uploadPhoto } from '../../../lib/upload';

/** Step 2 of posting: add photos, then publish. Also used later to manage photos. */
export default function ListingPhotos() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const qc = useQueryClient();
  const query = useListing(id);
  const deletePhoto = useDeletePhoto(id);
  const reorder = useReorderPhotos(id);
  const action = useListingAction();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  if (query.isLoading) return <Loading />;
  if (query.isError || !query.data) return <ErrorView error={query.error} onRetry={() => query.refetch()} />;
  const l = query.data;
  const slotsLeft = l.photo_slots_left ?? 0;
  const canPublish = l.status === 'draft' || l.status === 'rented' || l.status === 'expired';

  const upload = async (uris: string[]) => {
    setProgress({ done: 0, total: uris.length });
    let failed = 0;
    for (const [i, uri] of uris.entries()) {
      try {
        const updated = await uploadPhoto(id, uri);
        qc.setQueryData(['listing', id], updated); // show each photo as soon as it's in
      } catch (err) {
        failed += 1;
        console.log('Upload failed', err);
      }
      setProgress({ done: i + 1, total: uris.length });
    }
    setProgress(null);
    qc.invalidateQueries({ queryKey: ['my-listings'] });
    if (failed) Alert.alert(t('photos.someFailed', { count: failed }));
  };

  const addFromLibrary = async () => {
    try {
      const uris = await pickPhotos(slotsLeft);
      if (uris?.length) await upload(uris.slice(0, slotsLeft));
    } catch {
      Alert.alert(t('photos.permission'));
    }
  };

  const addFromCamera = async () => {
    try {
      const uri = await takePhoto();
      if (uri) await upload([uri]);
    } catch {
      Alert.alert(t('photos.permission'));
    }
  };

  const confirmDelete = (photoId: string) =>
    Alert.alert(t('photos.deleteTitle'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('photos.delete'),
        style: 'destructive',
        onPress: () => deletePhoto.mutate(photoId, { onError: (e) => Alert.alert(errorText(e)) }),
      },
    ]);

  const makeCover = (photoId: string) =>
    reorder.mutate([photoId, ...l.photos.map((p) => p.id).filter((x) => x !== photoId)]);

  const publish = () =>
    action.mutate(
      { id, action: 'publish' },
      {
        onSuccess: () => {
          Alert.alert('🎉', t('photos.published'));
          router.replace('/(tabs)/mine');
        },
        onError: (e) => Alert.alert(errorText(e)),
      },
    );

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>📷 {t('photos.title')}</Text>
        <Text style={styles.hint}>{t('photos.hint', { count: slotsLeft })}</Text>

        <View style={styles.grid}>
          {l.photos.map((p, index) => (
            <View key={p.id} style={styles.cell}>
              <Image source={p.url} style={styles.photo} contentFit="cover" />
              {index === 0 ? (
                <View style={styles.coverTag}>
                  <Text style={styles.coverText}>{t('photos.cover')}</Text>
                </View>
              ) : (
                <Pressable style={styles.coverBtn} onPress={() => makeCover(p.id)}>
                  <Text style={styles.coverBtnText}>★</Text>
                </Pressable>
              )}
              <Pressable style={styles.deleteBtn} onPress={() => confirmDelete(p.id)}>
                <Text style={styles.deleteText}>✕</Text>
              </Pressable>
            </View>
          ))}
        </View>

        {progress ? (
          <Text style={styles.progress}>
            ⏳ {t('photos.uploading', { done: progress.done, total: progress.total })}
          </Text>
        ) : null}

        {slotsLeft > 0 ? (
          <View style={{ gap: space.sm, marginTop: space.lg }}>
            <Button title={`🖼 ${t('photos.fromLibrary')}`} variant="outline" onPress={addFromLibrary}
              disabled={!!progress} />
            <Button title={`📸 ${t('photos.fromCamera')}`} variant="outline" onPress={addFromCamera}
              disabled={!!progress} />
          </View>
        ) : null}
        <Text style={styles.tip}>💡 {t('photos.tip')}</Text>
      </ScrollView>

      <View style={styles.footer}>
        {canPublish ? (
          <Button title={`🚀 ${t('photos.publish')}`} onPress={publish} loading={action.isPending}
            disabled={l.photos.length === 0 || !!progress} />
        ) : (
          <Button title={t('photos.done')} onPress={() => router.back()} disabled={!!progress} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: 120 },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  hint: { color: colors.textMuted, marginTop: space.xs, marginBottom: space.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  cell: { width: '31%', aspectRatio: 1, borderRadius: radius.md, overflow: 'hidden' },
  photo: { width: '100%', height: '100%', backgroundColor: colors.border },
  coverTag: {
    position: 'absolute', left: 4, bottom: 4, backgroundColor: colors.primary,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
  },
  coverText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  coverBtn: {
    position: 'absolute', left: 4, bottom: 4, backgroundColor: 'rgba(15,23,42,0.6)',
    width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
  },
  coverBtnText: { color: '#FACC15', fontSize: 14 },
  deleteBtn: {
    position: 'absolute', right: 4, top: 4, backgroundColor: 'rgba(15,23,42,0.6)',
    width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
  },
  deleteText: { color: '#fff', fontWeight: '700' },
  progress: { marginTop: space.lg, color: colors.primaryDark, fontWeight: '600', textAlign: 'center' },
  tip: { color: colors.textMuted, marginTop: space.lg, fontSize: 13 },
  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.lg, paddingBottom: space.xl,
    backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border,
  },
});
