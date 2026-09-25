import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useSavedIds, useToggleSaved } from '../lib/favorites';
import { formatDistance, formatRs, freshness } from '../lib/format';
import { colors, font, radius, shadow, space } from '../lib/theme';
import type { ListingCard as Card } from '../lib/types';
import { Skeleton, tap } from './ui';

const AMENITY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  water_24h: 'water',
  bike_parking: 'bicycle',
  car_parking: 'car',
  internet: 'wifi',
  attached_bathroom: 'water-outline',
  kitchen: 'restaurant',
  sunlight: 'sunny',
  balcony: 'leaf',
};

export function SaveButton({ id, size = 36 }: { id: string; size?: number }) {
  const saved = useSavedIds().has(id);
  const toggle = useToggleSaved();
  return (
    <Pressable
      hitSlop={8}
      accessibilityLabel={saved ? 'Remove from saved' : 'Save'}
      onPress={() => {
        tap();
        toggle(id, saved);
      }}
      style={[styles.save, { width: size, height: size, borderRadius: size / 2 }]}>
      <Ionicons name={saved ? 'heart' : 'heart-outline'} size={size * 0.56} color={saved ? colors.accent : colors.text} />
    </Pressable>
  );
}

/**
 * `large`  – full-width card for lists
 * `compact` – fixed-width card for horizontal carousels
 */
export function ListingCard({ item, variant = 'large', width }: { item: Card; variant?: 'large' | 'compact'; width?: number }) {
  const { t } = useTranslation();
  const distance = formatDistance(item.distance_m);
  const fresh = freshness(item.last_confirmed_at, t);
  const compact = variant === 'compact';
  const amenities = item.amenities.filter((a) => AMENITY_ICONS[a]).slice(0, compact ? 2 : 3);

  return (
    <Pressable
      onPress={() => router.push(`/listing/${item.id}`)}
      style={({ pressed }) => [
        styles.card,
        shadow(2),
        compact ? { width } : null,
        pressed && { transform: [{ scale: 0.985 }] },
      ]}>
      <View>
        {item.cover_photo_url ? (
          <Image
            source={item.cover_photo_url}
            style={[styles.photo, { height: compact ? 150 : 210 }]}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={[styles.photo, styles.noPhoto, { height: compact ? 150 : 210 }]}>
            <Ionicons name="home" size={40} color={colors.primaryTint} />
          </View>
        )}
        <LinearGradient colors={['rgba(0,0,0,0.35)', 'transparent']} style={styles.topFade} />
        <View style={styles.topRow}>
          <View style={styles.typePill}>
            <Text style={styles.typeText}>{t(`types.${item.listing_type}`)}</Text>
          </View>
          <SaveButton id={item.id} size={compact ? 32 : 36} />
        </View>
        {fresh.level === 'fresh' ? (
          <View style={styles.freshPill}>
            <View style={styles.freshDot} />
            <Text style={styles.freshText} numberOfLines={1}>{fresh.label}</Text>
          </View>
        ) : null}
        {item.photo_count > 1 && !compact ? (
          <View style={styles.photoCount}>
            <Ionicons name="images" size={12} color="#fff" />
            <Text style={styles.photoCountText}>{item.photo_count}</Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.body, compact && { padding: space.md }]}>
        <View style={styles.priceRow}>
          <Text style={[styles.price, compact && { fontSize: 17 }]}>{formatRs(item.total_monthly_cost)}</Text>
          <Text style={styles.perMonth}>{t('listing.perMonth')}</Text>
          {item.listed_by_role === 'agent' ? (
            <View style={styles.agentTag}>
              <Text style={styles.agentText}>{t('roles.agent')}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
        <View style={styles.metaRow}>
          <Ionicons name="location" size={14} color={colors.textMuted} />
          <Text style={styles.meta} numberOfLines={1}>
            {item.area}
            {distance ? ` · ${distance}` : ''}
          </Text>
        </View>
        {amenities.length > 0 ? (
          <View style={styles.amenities}>
            {amenities.map((a) => (
              <View key={a} style={styles.amenity}>
                <Ionicons name={AMENITY_ICONS[a]} size={13} color={colors.primary} />
                {!compact ? <Text style={styles.amenityText}>{t(`amenities.${a}`)}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export function ListingCardSkeleton({ variant = 'large', width }: { variant?: 'large' | 'compact'; width?: number }) {
  const compact = variant === 'compact';
  return (
    <View style={[styles.card, shadow(1), compact ? { width } : null]}>
      <Skeleton width="100%" height={compact ? 150 : 210} radius={0} />
      <View style={{ padding: space.lg, gap: space.sm }}>
        <Skeleton width="45%" height={18} />
        <Skeleton width="80%" height={14} />
        <Skeleton width="55%" height={12} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.xl, marginBottom: space.lg, overflow: 'hidden' },
  photo: { width: '100%', backgroundColor: colors.primarySoft },
  noPhoto: { alignItems: 'center', justifyContent: 'center' },
  topFade: { position: 'absolute', top: 0, left: 0, right: 0, height: 70 },
  topRow: {
    position: 'absolute',
    top: space.md,
    left: space.md,
    right: space.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  typePill: { backgroundColor: 'rgba(255,255,255,0.95)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  typeText: { ...font.tiny, color: colors.text, fontSize: 12 },
  save: { backgroundColor: 'rgba(255,255,255,0.95)', alignItems: 'center', justifyContent: 'center' },
  freshPill: {
    position: 'absolute',
    left: space.md,
    bottom: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(11,18,32,0.72)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    maxWidth: '75%',
  },
  freshDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#3DDC84' },
  freshText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  photoCount: {
    position: 'absolute',
    right: space.md,
    bottom: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(11,18,32,0.72)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  photoCountText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  body: { padding: space.lg, gap: 3 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  price: { fontSize: 20, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  perMonth: { ...font.small, color: colors.textMuted },
  agentTag: { marginLeft: 'auto', backgroundColor: colors.agentBg, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  agentText: { color: colors.agent, fontSize: 11, fontWeight: '700' },
  title: { ...font.bodyStrong, color: colors.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  meta: { ...font.small, color: colors.textMuted, flex: 1 },
  amenities: { flexDirection: 'row', gap: space.xs + 2, marginTop: space.sm, flexWrap: 'wrap' },
  amenity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  amenityText: { fontSize: 11, fontWeight: '600', color: colors.primaryDark },
});
