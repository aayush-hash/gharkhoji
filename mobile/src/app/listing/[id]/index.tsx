// Listing detail — photos first, then the three trust questions:
// Is it real? Is it still vacant? What will I actually pay?
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import MapView, { Circle } from 'react-native-maps';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useListing } from '../../../api/hooks';
import { FreshnessBadge, RoleBadge } from '../../../components/badges';
import { SaveButton } from '../../../components/ListingCard';
import { ReportSheet } from '../../../components/ReportSheet';
import { Avatar, Badge, Button, EmptyState, ErrorView, IconButton, Skeleton } from '../../../components/ui';
import { ApiError } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { formatRs } from '../../../lib/format';
import { colors, font, radius, shadow, space } from '../../../lib/theme';

const AMENITY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  water_24h: 'water',
  drinking_water: 'water-outline',
  attached_bathroom: 'body',
  kitchen: 'restaurant',
  balcony: 'leaf',
  sunlight: 'sunny',
  bike_parking: 'bicycle',
  car_parking: 'car',
  internet: 'wifi',
  separate_meter: 'speedometer',
  hot_water: 'flame',
  pets_allowed: 'paw',
  road_access: 'trail-sign',
  near_public_transport: 'bus',
};

export default function ListingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const user = useAuth((s) => s.user);
  const [reportOpen, setReportOpen] = useState(false);
  const query = useListing(id);
  const [photoIndex, setPhotoIndex] = useState(0);
  const heroHeight = Math.min(width * 0.85, 420);

  if (query.isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Skeleton width="100%" height={heroHeight} radius={0} />
        <View style={{ padding: space.lg, gap: space.md }}>
          <Skeleton width="60%" height={26} />
          <Skeleton width="40%" height={16} />
          <Skeleton width="100%" height={140} radius={radius.xl} />
        </View>
      </View>
    );
  }
  if (query.isError || !query.data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <IconButton name="chevron-back" onPress={() => router.back()} style={{ margin: space.lg }} />
        {query.error instanceof ApiError && query.error.status === 404 ? (
          // Rented, removed by a moderator, or the owner deleted it
          <EmptyState
            icon="home-outline"
            title={t('listing.goneTitle')}
            text={t('listing.goneText')}
            action={t('listing.goneAction')}
            onAction={() => router.replace('/search')}
          />
        ) : (
          <ErrorView error={query.error} onRetry={() => query.refetch()} />
        )}
      </SafeAreaView>
    );
  }
  const l = query.data;
  const isMine = Boolean(l.exact_location);

  const costRows: [string, number, keyof typeof Ionicons.glyphMap][] = [
    [t('listing.rent'), l.cost.rent, 'home'],
    [t('listing.water'), l.cost.water, 'water'],
    [t('listing.waste'), l.cost.waste, 'trash'],
    [t('listing.internet'), l.cost.internet, 'wifi'],
    [t('listing.parking'), l.cost.parking, 'car'],
  ];

  const share = () =>
    Share.share({
      message: `${l.title} — ${formatRs(l.cost.total_monthly)}${t('listing.perMonth')} · ${l.area}\nGharKhoji`,
    });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 130 }} showsVerticalScrollIndicator={false}>
        {/* ---------- Photos ---------- */}
        <View style={{ height: heroHeight }}>
          {l.photos.length > 0 ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => setPhotoIndex(Math.round(e.nativeEvent.contentOffset.x / width))}>
              {l.photos.map((p) => (
                <Image key={p.id} source={p.url} style={{ width, height: heroHeight }} contentFit="cover" transition={200} />
              ))}
            </ScrollView>
          ) : (
            <View style={[styles.noPhoto, { height: heroHeight }]}>
              <Ionicons name="home" size={64} color={colors.primaryTint} />
            </View>
          )}
          <LinearGradient
            colors={['rgba(0,0,0,0.45)', 'transparent']}
            style={[styles.topFade, { height: insets.top + 80 }]}
            pointerEvents="none"
          />
          <View style={[styles.topBar, { top: insets.top + space.sm }]}>
            <IconButton name="chevron-back" onPress={() => router.back()} accessibilityLabel="Back" />
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <IconButton name="share-outline" onPress={share} accessibilityLabel="Share" />
              {!isMine ? <SaveButton id={l.id} size={40} /> : null}
            </View>
          </View>
          {l.photos.length > 1 ? (
            <View style={styles.dots}>
              {l.photos.map((p, i) => (
                <View key={p.id} style={[styles.dot, i === photoIndex && styles.dotActive]} />
              ))}
            </View>
          ) : null}
        </View>

        {/* ---------- Title block ---------- */}
        <View style={styles.sheet}>
          <View style={styles.badges}>
            <Badge label={t(`types.${l.listing_type}`)} color={colors.primaryDark} bg={colors.primarySoft} icon="home" />
            <RoleBadge role={l.listed_by.role} />
            {isMine ? <Badge label={t(`status.${l.status}`)} color={colors.stale} bg={colors.staleBg} /> : null}
          </View>
          <Text style={styles.title}>{l.title}</Text>
          <View style={styles.locRow}>
            <Ionicons name="location" size={16} color={colors.primary} />
            <Text style={styles.loc}>
              {l.area}
              {l.landmark ? ` · ${l.landmark}` : ''}
            </Text>
          </View>

          {/* ---------- Trust row ---------- */}
          <View style={[styles.trust, shadow(1)]}>
            <FreshnessBadge confirmedAt={l.last_confirmed_at} />
            {l.listed_by.phone_verified ? (
              <Badge label={t('listing.phoneVerified')} color={colors.fresh} bg={colors.freshBg} icon="call" />
            ) : null}
          </View>

          {/* ---------- What will I pay ---------- */}
          <View style={[styles.card, shadow(1)]}>
            <Text style={styles.cardLabel}>{t('listing.totalMonthly')}</Text>
            <Text style={styles.total}>
              {formatRs(l.cost.total_monthly)}
              <Text style={styles.perMonth}>{t('listing.perMonth')}</Text>
            </Text>
            {costRows
              .filter(([, amount]) => amount > 0)
              .map(([label, amount, icon]) => (
                <View key={label} style={styles.costRow}>
                  <Ionicons name={icon} size={16} color={colors.textMuted} />
                  <Text style={styles.costLabel}>{label}</Text>
                  <Text style={styles.costValue}>{formatRs(amount)}</Text>
                </View>
              ))}
            <View style={[styles.costRow, styles.divider]}>
              <Ionicons name="wallet" size={16} color={colors.textMuted} />
              <Text style={styles.costLabel}>{t('listing.deposit')}</Text>
              <Text style={styles.costValue}>{formatRs(l.deposit)}</Text>
            </View>
            {l.agent_commission != null ? (
              <View style={styles.costRow}>
                <Ionicons name="briefcase" size={16} color={colors.agent} />
                <Text style={[styles.costLabel, { color: colors.agent }]}>{t('listing.commission')}</Text>
                <Text style={[styles.costValue, { color: colors.agent }]}>{formatRs(l.agent_commission)}</Text>
              </View>
            ) : null}
            <View style={styles.noFee}>
              <Ionicons name="shield-checkmark" size={15} color={colors.fresh} />
              <Text style={styles.noFeeText}>{t('listing.noHiddenFees')}</Text>
            </View>
          </View>

          {/* ---------- Facilities ---------- */}
          {l.amenities.length > 0 ? (
            <>
              <Text style={styles.section}>{t('listing.amenities')}</Text>
              <View style={styles.amenities}>
                {l.amenities.map((a) => (
                  <View key={a} style={[styles.amenity, { width: (Math.min(width, 700) - space.lg * 2 - space.sm) / 2 }]}>
                    <View style={styles.amenityIcon}>
                      <Ionicons name={AMENITY_ICONS[a] ?? 'checkmark'} size={17} color={colors.primary} />
                    </View>
                    <Text style={styles.amenityText} numberOfLines={1}>
                      {t(`amenities.${a}`, { defaultValue: a })}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {/* ---------- Details ---------- */}
          <Text style={styles.section}>{t('listing.details')}</Text>
          <View style={[styles.card, shadow(1), { paddingVertical: space.sm }]}>
            <DetailRow icon="bed" label={t('listing.furnishing')} value={t(`furnishing.${l.furnishing}`)} />
            {l.floor != null ? <DetailRow icon="layers" label={t('listing.floor')} value={String(l.floor)} /> : null}
            {l.max_occupants != null ? <DetailRow icon="people" label={t('listing.occupants')} value={String(l.max_occupants)} /> : null}
            {l.available_from ? <DetailRow icon="calendar" label={t('listing.availableFrom')} value={l.available_from} /> : null}
          </View>
          {l.description ? <Text style={styles.description}>{l.description}</Text> : null}

          {/* ---------- Location (approximate) ---------- */}
          <Text style={styles.section}>{t('listing.location')}</Text>
          <View style={[styles.mapCard, shadow(1)]}>
            <MapView
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
              scrollEnabled={false}
              zoomEnabled={false}
              rotateEnabled={false}
              pitchEnabled={false}
              initialRegion={{
                latitude: l.approx_location.lat,
                longitude: l.approx_location.lng,
                latitudeDelta: 0.012,
                longitudeDelta: 0.012,
              }}>
              <Circle
                center={{ latitude: l.approx_location.lat, longitude: l.approx_location.lng }}
                radius={300}
                fillColor="rgba(11,122,104,0.18)"
                strokeColor={colors.primary}
                strokeWidth={2}
              />
            </MapView>
          </View>
          <View style={styles.privacy}>
            <Ionicons name="lock-closed" size={14} color={colors.textMuted} />
            <Text style={styles.privacyText}>{t('listing.approxLocation')}</Text>
          </View>

          {/* ---------- Listed by ---------- */}
          <Text style={styles.section}>{t('listing.listedBy')}</Text>
          <View style={[styles.card, shadow(1), styles.owner]}>
            <Avatar name={l.listed_by.name} size={52} />
            <View style={{ flex: 1 }}>
              <Text style={styles.ownerName}>{l.listed_by.name ?? '—'}</Text>
              <Text style={styles.ownerRole}>{t(`roles.${l.listed_by.role}`)}</Text>
            </View>
            {l.listed_by.phone_verified ? <Ionicons name="shield-checkmark" size={24} color={colors.fresh} /> : null}
          </View>

          {!isMine ? (
            <Pressable
              style={styles.reportRow}
              accessibilityRole="button"
              onPress={() => (user ? setReportOpen(true) : router.push('/auth/login'))}>
              <Ionicons name="flag-outline" size={16} color={colors.textMuted} />
              <Text style={styles.reportText}>{t('report.link')}</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
      <ReportSheet listingId={l.id} visible={reportOpen} onClose={() => setReportOpen(false)} />

      {/* ---------- Sticky bottom bar ---------- */}
      <View style={[styles.footer, shadow(3), { paddingBottom: Math.max(insets.bottom, space.md) }]}>
        {/* Price keeps its natural width; the button gets the rest of the row */}
        <View style={styles.footerPriceBox}>
          <Text style={styles.footerPrice} numberOfLines={1}>{formatRs(l.cost.total_monthly)}</Text>
          <Text style={styles.footerSub} numberOfLines={1}>{t('listing.perMonthAll')}</Text>
        </View>
        <View style={styles.footerAction}>
          {isMine ? (
            <Button title={t('mine.edit')} icon="create" size="md" onPress={() => router.push(`/listing/${l.id}/edit`)} />
          ) : user ? (
            <Button
              title={l.listed_by.role === 'agent' ? t('chat.chatWithAgent') : t('chat.chatWithOwner')}
              icon="chatbubbles"
              size="md"
              onPress={() => router.push(`/chat/start/${l.id}`)}
            />
          ) : (
            <Button title={t('listing.loginToContact')} icon="log-in" size="md" onPress={() => router.push('/auth/login')} />
          )}
        </View>
      </View>
    </View>
  );
}

function DetailRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon} size={18} color={colors.primary} />
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}


const styles = StyleSheet.create({
  noPhoto: { backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  topFade: { position: 'absolute', top: 0, left: 0, right: 0 },
  topBar: { position: 'absolute', left: space.lg, right: space.lg, flexDirection: 'row', justifyContent: 'space-between' },
  dots: { position: 'absolute', bottom: 36, alignSelf: 'center', flexDirection: 'row', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.55)' },
  dotActive: { width: 18, backgroundColor: '#fff' },
  sheet: {
    marginTop: -24,
    backgroundColor: colors.bg,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: space.lg,
    paddingTop: space.xl,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },
  badges: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  title: { ...font.h1, color: colors.text, marginTop: space.md },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: space.sm },
  loc: { ...font.body, color: colors.textSecondary, flex: 1 },
  trust: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.md,
    marginTop: space.lg,
  },
  card: { backgroundColor: colors.card, borderRadius: radius.xl, padding: space.lg, marginTop: space.lg },
  cardLabel: { ...font.smallStrong, color: colors.textMuted },
  total: { fontSize: 30, fontWeight: '800', color: colors.primaryDark, marginTop: 4, marginBottom: space.md, letterSpacing: -0.5 },
  perMonth: { fontSize: 15, fontWeight: '500', color: colors.textMuted },
  costRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 6 },
  costLabel: { ...font.body, color: colors.textSecondary, flex: 1 },
  costValue: { ...font.bodyStrong, color: colors.text },
  divider: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: space.sm, paddingTop: space.md },
  noFee: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.freshBg,
    borderRadius: radius.md,
    padding: space.sm,
    marginTop: space.md,
  },
  noFeeText: { ...font.smallStrong, color: colors.fresh, flex: 1 },
  section: { ...font.h2, color: colors.text, marginTop: space.xxl },
  amenities: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  amenity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  amenityIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amenityText: { ...font.smallStrong, color: colors.text, flex: 1 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  detailLabel: { ...font.body, color: colors.textSecondary, flex: 1 },
  detailValue: { ...font.bodyStrong, color: colors.text },
  description: { ...font.body, color: colors.textSecondary, marginTop: space.lg, lineHeight: 23 },
  mapCard: { height: 180, borderRadius: radius.xl, overflow: 'hidden', marginTop: space.md, backgroundColor: colors.primarySoft },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.sm },
  privacyText: { ...font.small, color: colors.textMuted, flex: 1 },
  owner: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  ownerName: { ...font.h3, color: colors.text },
  ownerRole: { ...font.small, color: colors.textMuted, marginTop: 2 },
  reportRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: space.lg, marginTop: space.sm },
  reportText: { ...font.smallStrong, color: colors.textMuted, textDecorationLine: 'underline' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.card,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  footerPriceBox: { flexShrink: 0, maxWidth: '50%' },
  footerAction: { flex: 1, minWidth: 0 },
  footerPrice: { fontSize: 20, fontWeight: '800', color: colors.text },
  footerSub: { ...font.small, color: colors.textMuted },
});
