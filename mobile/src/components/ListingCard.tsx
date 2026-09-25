import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { formatDistance, formatRs } from '../lib/format';
import { colors, radius, space } from '../lib/theme';
import type { ListingCard as Card } from '../lib/types';
import { FreshnessBadge, RoleBadge } from './badges';

export function ListingCard({ item }: { item: Card }) {
  const { t } = useTranslation();
  const distance = formatDistance(item.distance_m);
  const topAmenities = item.amenities.slice(0, 3).map((a) => t(`amenities.${a}`, { defaultValue: a }));

  return (
    <Pressable
      onPress={() => router.push(`/listing/${item.id}`)}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}>
      <View>
        {item.cover_photo_url ? (
          <Image source={item.cover_photo_url} style={styles.photo} contentFit="cover" transition={150} />
        ) : (
          <View style={[styles.photo, styles.noPhoto]}>
            <Text style={{ fontSize: 40 }}>🏠</Text>
          </View>
        )}
        <View style={styles.typePill}>
          <Text style={styles.typeText}>{t(`types.${item.listing_type}`)}</Text>
        </View>
      </View>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.area} numberOfLines={1}>
          📍 {item.area}
          {distance ? ` · ${distance}` : ''}
        </Text>

        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatRs(item.total_monthly_cost)}</Text>
          <Text style={styles.perMonth}>{t('listing.perMonth')}</Text>
          {item.total_monthly_cost !== item.rent ? (
            <Text style={styles.rentNote}>
              {' '}
              ({t('listing.rent')} {formatRs(item.rent)})
            </Text>
          ) : null}
        </View>

        {topAmenities.length > 0 ? <Text style={styles.amenities}>{topAmenities.join(' · ')}</Text> : null}

        <View style={styles.badges}>
          <FreshnessBadge confirmedAt={item.last_confirmed_at} />
          <RoleBadge role={item.listed_by_role} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    marginBottom: space.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  photo: { width: '100%', height: 180, backgroundColor: colors.border },
  noPhoto: { alignItems: 'center', justifyContent: 'center' },
  typePill: {
    position: 'absolute',
    top: space.sm,
    left: space.sm,
    backgroundColor: 'rgba(15,23,42,0.75)',
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  typeText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  body: { padding: space.md },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  area: { color: colors.textMuted, marginTop: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: space.sm, flexWrap: 'wrap' },
  price: { fontSize: 18, fontWeight: '800', color: colors.primaryDark },
  perMonth: { color: colors.textMuted },
  rentNote: { color: colors.textMuted, fontSize: 12 },
  amenities: { color: colors.text, marginTop: space.xs, fontSize: 13 },
  badges: { flexDirection: 'row', gap: space.sm, marginTop: space.sm, flexWrap: 'wrap' },
});
