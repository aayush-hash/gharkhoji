import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useListing } from '../../../api/hooks';
import { FreshnessBadge, RoleBadge } from '../../../components/badges';
import { Badge, Button, ErrorView, Loading, SectionTitle } from '../../../components/ui';
import { useAuth } from '../../../lib/auth';
import { formatRs } from '../../../lib/format';
import { colors, radius, space } from '../../../lib/theme';

export default function ListingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const user = useAuth((s) => s.user);
  const query = useListing(id);
  const [photoIndex, setPhotoIndex] = useState(0);

  if (query.isLoading) return <Loading />;
  if (query.isError || !query.data) return <ErrorView error={query.error} onRetry={() => query.refetch()} />;
  const l = query.data;

  const costRows: [string, number][] = [
    [t('listing.rent'), l.cost.rent],
    [t('listing.water'), l.cost.water],
    [t('listing.waste'), l.cost.waste],
    [t('listing.internet'), l.cost.internet],
    [t('listing.parking'), l.cost.parking],
  ];

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Photo carousel */}
        {l.photos.length > 0 ? (
          <View>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => setPhotoIndex(Math.round(e.nativeEvent.contentOffset.x / width))}>
              {l.photos.map((p) => (
                <Image key={p.id} source={p.url} style={{ width, height: 260 }} contentFit="cover" transition={150} />
              ))}
            </ScrollView>
            <View style={styles.counter}>
              <Text style={styles.counterText}>
                {photoIndex + 1} / {l.photos.length}
              </Text>
            </View>
          </View>
        ) : (
          <View style={[styles.noPhoto, { width }]}>
            <Text style={{ fontSize: 56 }}>🏠</Text>
          </View>
        )}

        <View style={styles.body}>
          <View style={styles.badges}>
            <Badge label={t(`types.${l.listing_type}`)} color={colors.primaryDark} bg={colors.primarySoft} />
            <RoleBadge role={l.listed_by.role} />
          </View>
          <Text style={styles.title}>{l.title}</Text>
          <Text style={styles.area}>
            📍 {l.area}
            {l.landmark ? ` · ${l.landmark}` : ''}
          </Text>
          <View style={{ marginTop: space.sm }}>
            <FreshnessBadge confirmedAt={l.last_confirmed_at} />
          </View>

          {/* The key promise: what will I actually pay? */}
          <View style={styles.costCard}>
            <Text style={styles.costLabel}>{t('listing.totalMonthly')}</Text>
            <Text style={styles.costTotal}>
              {formatRs(l.cost.total_monthly)}
              <Text style={styles.perMonth}>{t('listing.perMonth')}</Text>
            </Text>
            {costRows
              .filter(([, amount]) => amount > 0)
              .map(([label, amount]) => (
                <View key={label} style={styles.costRow}>
                  <Text style={styles.costRowLabel}>{label}</Text>
                  <Text style={styles.costRowValue}>{formatRs(amount)}</Text>
                </View>
              ))}
            <View style={[styles.costRow, styles.costDivider]}>
              <Text style={styles.costRowLabel}>{t('listing.deposit')}</Text>
              <Text style={styles.costRowValue}>{formatRs(l.deposit)}</Text>
            </View>
            {l.agent_commission != null ? (
              <View style={styles.costRow}>
                <Text style={[styles.costRowLabel, { color: colors.agent }]}>{t('listing.commission')}</Text>
                <Text style={[styles.costRowValue, { color: colors.agent }]}>{formatRs(l.agent_commission)}</Text>
              </View>
            ) : null}
          </View>

          {l.amenities.length > 0 ? (
            <>
              <SectionTitle>{t('listing.amenities')}</SectionTitle>
              <View style={styles.amenities}>
                {l.amenities.map((a) => (
                  <View key={a} style={styles.amenity}>
                    <Text style={styles.amenityText}>✓ {t(`amenities.${a}`, { defaultValue: a })}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          <SectionTitle>{t('listing.details')}</SectionTitle>
          <DetailRow label={t('listing.furnishing')} value={t(`furnishing.${l.furnishing}`)} />
          {l.floor != null ? <DetailRow label={t('listing.floor')} value={String(l.floor)} /> : null}
          {l.max_occupants != null ? <DetailRow label={t('listing.occupants')} value={String(l.max_occupants)} /> : null}
          {l.available_from ? <DetailRow label={t('listing.availableFrom')} value={l.available_from} /> : null}

          {l.description ? <Text style={styles.description}>{l.description}</Text> : null}

          <SectionTitle>{t('listing.location')}</SectionTitle>
          <Text style={styles.muted}>🔒 {t('listing.approxLocation')}</Text>

          <SectionTitle>{t('listing.listedBy')}</SectionTitle>
          <Text style={styles.listedBy}>
            {l.listed_by.name ?? '—'} · {t(`roles.${l.listed_by.role}`)}
          </Text>
          {l.listed_by.phone_verified ? <Text style={styles.verified}>✓ {t('listing.phoneVerified')}</Text> : null}
        </View>
      </ScrollView>

      {/* Contact bar — chat & visit booking arrive after the MVP core */}
      <SafeAreaView edges={['bottom']} style={styles.footer}>
        {l.exact_location ? (
          // You own this listing
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button title={`✏️ ${t('mine.edit')}`} variant="outline" style={{ flex: 1 }}
              onPress={() => router.push(`/listing/${l.id}/edit`)} />
            <Button title={`📷 ${t('photos.screenTitle')}`} variant="outline" style={{ flex: 1 }}
              onPress={() => router.push(`/listing/${l.id}/photos`)} />
          </View>
        ) : user ? (
          <Button title={t('listing.contactSoon')} onPress={() => {}} disabled variant="outline" />
        ) : (
          <Button title={t('listing.loginToContact')} onPress={() => router.push('/login')} />
        )}
      </SafeAreaView>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  counter: {
    position: 'absolute',
    bottom: space.sm,
    right: space.sm,
    backgroundColor: 'rgba(15,23,42,0.7)',
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  counterText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  noPhoto: { height: 200, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.border },
  body: { padding: space.lg },
  badges: { flexDirection: 'row', gap: space.sm },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, marginTop: space.sm },
  area: { color: colors.textMuted, marginTop: space.xs, fontSize: 15 },
  costCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.lg,
    marginTop: space.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  costLabel: { color: colors.textMuted, fontWeight: '600' },
  costTotal: { fontSize: 28, fontWeight: '800', color: colors.primaryDark, marginVertical: space.sm },
  perMonth: { fontSize: 15, fontWeight: '400', color: colors.textMuted },
  costRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  costDivider: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: space.sm, paddingTop: space.sm },
  costRowLabel: { color: colors.text },
  costRowValue: { color: colors.text, fontWeight: '600' },
  amenities: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  amenity: { backgroundColor: colors.primarySoft, paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill },
  amenityText: { color: colors.primaryDark, fontWeight: '600', fontSize: 13 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detailValue: { color: colors.text, fontWeight: '600' },
  description: { color: colors.text, marginTop: space.lg, lineHeight: 22 },
  muted: { color: colors.textMuted },
  listedBy: { color: colors.text, fontWeight: '600', fontSize: 16 },
  verified: { color: colors.fresh, marginTop: space.xs, fontWeight: '600' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.md,
  },
});
