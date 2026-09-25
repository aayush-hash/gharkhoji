import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useMapSearch } from '../../api/hooks';
import { formatRs } from '../../lib/format';
import { clampToValley, getMyLocation, insideValley, KATHMANDU } from '../../lib/location';
import { colors, radius, space } from '../../lib/theme';
import type { ListingCard } from '../../lib/types';

const START: Region = { latitude: KATHMANDU.lat, longitude: KATHMANDU.lng, latitudeDelta: 0.08, longitudeDelta: 0.08 };

/** Visible map area → a search circle (backend allows up to 20 km). */
function regionToCenter(r: Region) {
  const c = clampToValley(r.latitude, r.longitude);
  const radiusKm = Math.min(20, Math.max(1, (Math.max(r.latitudeDelta, r.longitudeDelta) * 111) / 2));
  return { lat: Number(c.lat.toFixed(4)), lng: Number(c.lng.toFixed(4)), radius_km: Number(radiusKm.toFixed(1)) };
}

/** Short price label for pins: 15000 → "15k" */
const shortPrice = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

export default function MapScreen() {
  const { t } = useTranslation();
  const mapRef = useRef<MapView>(null);
  const [center, setCenter] = useState(regionToCenter(START));
  const [selected, setSelected] = useState<ListingCard | null>(null);
  const query = useMapSearch(center);
  const items = query.data?.items ?? [];

  const goToMe = async () => {
    const me = await getMyLocation();
    if (!me) return Alert.alert(t('post.locationDenied'));
    if (!insideValley(me.lat, me.lng)) return Alert.alert(t('post.outsideValley'));
    mapRef.current?.animateToRegion(
      { latitude: me.lat, longitude: me.lng, latitudeDelta: 0.03, longitudeDelta: 0.03 },
      500,
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={START}
        showsUserLocation
        onRegionChangeComplete={(r) => setCenter(regionToCenter(r))}
        onPress={() => setSelected(null)}>
        {items.map((item) => (
          <Marker
            key={item.id}
            coordinate={{ latitude: item.approx_location.lat, longitude: item.approx_location.lng }}
            onPress={(e) => {
              e.stopPropagation();
              setSelected(item);
            }}>
            <View style={[styles.pin, selected?.id === item.id && styles.pinSelected]}>
              <Text style={[styles.pinText, selected?.id === item.id && { color: '#fff' }]}>
                {shortPrice(item.total_monthly_cost)}
              </Text>
            </View>
          </Marker>
        ))}
      </MapView>

      <SafeAreaView edges={['top']} style={styles.topBar} pointerEvents="box-none">
        <View style={styles.countPill}>
          {query.isFetching ? <ActivityIndicator size="small" color={colors.primary} /> : null}
          <Text style={styles.countText}>{t('map.count', { count: query.data?.total ?? 0 })}</Text>
        </View>
        <Pressable style={styles.meBtn} onPress={goToMe}>
          <Text style={{ fontSize: 20 }}>🎯</Text>
        </Pressable>
      </SafeAreaView>

      {selected ? (
        <Pressable style={styles.card} onPress={() => router.push(`/listing/${selected.id}`)}>
          <Text style={styles.cardTitle} numberOfLines={1}>{selected.title}</Text>
          <Text style={styles.cardArea} numberOfLines={1}>📍 {selected.area} · {t(`types.${selected.listing_type}`)}</Text>
          <Text style={styles.cardPrice}>
            {formatRs(selected.total_monthly_cost)}
            <Text style={styles.cardPer}>{t('listing.perMonth')}</Text>
          </Text>
          <Text style={styles.cardLink}>{t('map.open')} →</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pin: {
    backgroundColor: colors.card,
    borderColor: colors.primary,
    borderWidth: 1.5,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pinSelected: { backgroundColor: colors.primary },
  pinText: { color: colors.primaryDark, fontWeight: '800', fontSize: 12 },
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between', padding: space.md,
  },
  countPill: {
    flexDirection: 'row', alignItems: 'center', gap: space.xs, backgroundColor: colors.card,
    paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.pill,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  countText: { fontWeight: '700', color: colors.text },
  meBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, alignItems: 'center',
    justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  card: {
    position: 'absolute', left: space.lg, right: space.lg, bottom: space.lg, backgroundColor: colors.card,
    borderRadius: radius.lg, padding: space.lg, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }, elevation: 5,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  cardArea: { color: colors.textMuted, marginTop: 2 },
  cardPrice: { fontSize: 18, fontWeight: '800', color: colors.primaryDark, marginTop: space.sm },
  cardPer: { fontSize: 13, fontWeight: '400', color: colors.textMuted },
  cardLink: { color: colors.primary, fontWeight: '700', marginTop: space.sm },
});
