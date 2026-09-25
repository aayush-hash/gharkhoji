// The create/edit form for a listing. Used by /post (new) and /listing/[id]/edit.
import { useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import { useTranslation } from 'react-i18next';

import { useListingMeta, usePlaces } from '../api/hooks';
import { useAuth } from '../lib/auth';
import { formatRs } from '../lib/format';
import { getMyLocation, insideValley, KATHMANDU } from '../lib/location';
import { colors, radius, space } from '../lib/theme';
import type { Furnishing, ListingInput, ListingType } from '../lib/types';
import { Button, Chip, Field, SectionTitle } from './ui';

const TYPES: ListingType[] = ['room', '1bhk', '2bhk', '3bhk', 'flat'];
const FURNISHING: Furnishing[] = ['unfurnished', 'semi', 'full'];

/** Numbers are typed as text; convert safely. Empty → fallback. */
const num = (v: string, fallback = 0) => {
  const n = parseInt(v.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : fallback;
};
const str = (n: number | null | undefined) => (n == null ? '' : String(n));

export function ListingForm({
  initial,
  submitLabel,
  submitting,
  onSubmit,
}: {
  initial?: Partial<ListingInput>;
  submitLabel: string;
  submitting: boolean;
  onSubmit: (data: ListingInput) => void;
}) {
  const { t, i18n } = useTranslation();
  const role = useAuth((s) => s.user?.role);
  const meta = useListingMeta();
  const places = usePlaces();
  const mapRef = useRef<MapView>(null);

  const [type, setType] = useState<ListingType>(initial?.listing_type ?? 'room');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [rent, setRent] = useState(str(initial?.rent));
  const [deposit, setDeposit] = useState(str(initial?.deposit));
  const [water, setWater] = useState(str(initial?.water_charge));
  const [waste, setWaste] = useState(str(initial?.waste_charge));
  const [internet, setInternet] = useState(str(initial?.internet_charge));
  const [parking, setParking] = useState(str(initial?.parking_charge));
  const [commission, setCommission] = useState(str(initial?.agent_commission));
  const [amenities, setAmenities] = useState<string[]>(initial?.amenities ?? []);
  const [furnishing, setFurnishing] = useState<Furnishing>(initial?.furnishing ?? 'unfurnished');
  const [floor, setFloor] = useState(str(initial?.floor));
  const [occupants, setOccupants] = useState(str(initial?.max_occupants));
  const [area, setArea] = useState(initial?.area ?? '');
  const [landmark, setLandmark] = useState(initial?.landmark ?? '');
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(
    initial?.lat != null && initial?.lng != null ? { lat: initial.lat, lng: initial.lng } : null,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isAgent = role === 'agent';
  const total = num(rent) + num(water) + num(waste) + num(internet) + num(parking);
  const areaPlaces = (places.data ?? []).filter((p) => p.kind === 'area');

  const startRegion: Region = useMemo(() => {
    const c = pin ?? KATHMANDU;
    return { latitude: c.lat, longitude: c.lng, latitudeDelta: pin ? 0.01 : 0.12, longitudeDelta: pin ? 0.01 : 0.12 };
    // only for the first render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const movePin = (lat: number, lng: number, zoom = true) => {
    setPin({ lat, lng });
    if (zoom) {
      mapRef.current?.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 400);
    }
  };

  const useMyPosition = async () => {
    const me = await getMyLocation();
    if (!me) return Alert.alert(t('post.locationDenied'));
    if (!insideValley(me.lat, me.lng)) return Alert.alert(t('post.outsideValley'));
    movePin(me.lat, me.lng);
  };

  const toggleAmenity = (a: string) =>
    setAmenities((cur) => (cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]));

  const submit = () => {
    const e: Record<string, string> = {};
    if (title.trim().length < 5) e.title = t('post.errTitle');
    if (num(rent) < 1000) e.rent = t('post.errRent');
    if (deposit === '') e.deposit = t('post.errRequired');
    if (area.trim().length < 2) e.area = t('post.errArea');
    if (!pin) e.pin = t('post.errPin');
    if (isAgent && commission === '') e.commission = t('post.errCommission');
    setErrors(e);
    if (Object.keys(e).length > 0 || !pin) {
      Alert.alert(t('post.fixErrors'));
      return;
    }
    onSubmit({
      listing_type: type,
      title: title.trim(),
      description: description.trim() || null,
      rent: num(rent),
      deposit: num(deposit),
      water_charge: num(water),
      waste_charge: num(waste),
      internet_charge: num(internet),
      parking_charge: num(parking),
      agent_commission: isAgent ? num(commission) : null,
      amenities,
      furnishing,
      floor: floor === '' ? null : num(floor),
      max_occupants: occupants === '' ? null : num(occupants),
      area: area.trim(),
      landmark: landmark.trim() || null,
      lat: pin.lat,
      lng: pin.lng,
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <SectionTitle>{t('post.type')}</SectionTitle>
      <View style={styles.wrap}>
        {TYPES.map((ty) => (
          <Chip key={ty} label={t(`types.${ty}`)} selected={type === ty} onPress={() => setType(ty)} />
        ))}
      </View>

      <Field label={t('post.title')} value={title} onChangeText={setTitle} placeholder={t('post.titlePh')}
        error={errors.title} maxLength={120} />

      {/* ---------- Money: the "no surprises" section ---------- */}
      <SectionTitle>{t('post.money')}</SectionTitle>
      <View style={styles.row}>
        <View style={styles.half}>
          <Field label={t('listing.rent')} value={rent} onChangeText={setRent} keyboardType="number-pad"
            placeholder="15000" error={errors.rent} />
        </View>
        <View style={styles.half}>
          <Field label={t('listing.deposit')} value={deposit} onChangeText={setDeposit} keyboardType="number-pad"
            placeholder="30000" error={errors.deposit} />
        </View>
      </View>
      <Text style={styles.hint}>{t('post.chargesHint')}</Text>
      <View style={styles.row}>
        <View style={styles.half}>
          <Field label={t('listing.water')} value={water} onChangeText={setWater} keyboardType="number-pad" placeholder="0" />
        </View>
        <View style={styles.half}>
          <Field label={t('listing.waste')} value={waste} onChangeText={setWaste} keyboardType="number-pad" placeholder="0" />
        </View>
      </View>
      <View style={styles.row}>
        <View style={styles.half}>
          <Field label={t('listing.internet')} value={internet} onChangeText={setInternet} keyboardType="number-pad"
            placeholder="0" />
        </View>
        <View style={styles.half}>
          <Field label={t('listing.parking')} value={parking} onChangeText={setParking} keyboardType="number-pad"
            placeholder="0" />
        </View>
      </View>
      {isAgent ? (
        <Field label={t('listing.commission')} value={commission} onChangeText={setCommission}
          keyboardType="number-pad" placeholder="0" error={errors.commission} />
      ) : null}
      <View style={styles.totalBox}>
        <Text style={styles.totalLabel}>{t('listing.totalMonthly')}</Text>
        <Text style={styles.total}>{formatRs(total)}</Text>
      </View>

      {/* ---------- Location ---------- */}
      <SectionTitle>{t('post.location')}</SectionTitle>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: space.sm }}>
        {areaPlaces.map((p) => (
          <Chip key={p.slug} label={i18n.language === 'ne' ? p.name_ne : p.name} selected={area === p.name}
            onPress={() => {
              setArea(p.name);
              movePin(p.lat, p.lng);
            }} />
        ))}
      </ScrollView>
      <Field label={t('post.area')} value={area} onChangeText={setArea} placeholder="New Baneshwor" error={errors.area} />
      <Field label={t('post.landmark')} value={landmark} onChangeText={setLandmark} placeholder={t('post.landmarkPh')} />

      <Text style={styles.hint}>{t('post.pinHint')}</Text>
      <View style={[styles.mapBox, errors.pin ? { borderColor: colors.danger } : null]}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={startRegion}
          onPress={(e) => movePin(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude, false)}>
          {pin ? (
            <Marker
              coordinate={{ latitude: pin.lat, longitude: pin.lng }}
              draggable
              onDragEnd={(e) => movePin(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude, false)}
            />
          ) : null}
        </MapView>
      </View>
      {errors.pin ? <Text style={styles.error}>{errors.pin}</Text> : null}
      <Text style={styles.privacy}>{t('post.privacy')}</Text>
      <Button title={t('post.useMyLocation')} icon="navigate" variant="secondary" size="md" onPress={useMyPosition}
        style={{ marginTop: space.sm }} />

      {/* ---------- Facilities ---------- */}
      <SectionTitle>{t('listing.amenities')}</SectionTitle>
      <View style={styles.wrap}>
        {(meta.data?.amenities ?? []).map((a) => (
          <Chip key={a} label={t(`amenities.${a}`, { defaultValue: a })} selected={amenities.includes(a)}
            onPress={() => toggleAmenity(a)} />
        ))}
      </View>

      <SectionTitle>{t('listing.furnishing')}</SectionTitle>
      <View style={styles.wrap}>
        {FURNISHING.map((f) => (
          <Chip key={f} label={t(`furnishing.${f}`)} selected={furnishing === f} onPress={() => setFurnishing(f)} />
        ))}
      </View>

      <View style={[styles.row, { marginTop: space.md }]}>
        <View style={styles.half}>
          <Field label={t('listing.floor')} value={floor} onChangeText={setFloor} keyboardType="number-pad" placeholder="2" />
        </View>
        <View style={styles.half}>
          <Field label={t('listing.occupants')} value={occupants} onChangeText={setOccupants} keyboardType="number-pad"
            placeholder="2" />
        </View>
      </View>

      <Text style={styles.label}>{t('post.description')}</Text>
      <TextInput
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={2000}
        placeholder={t('post.descriptionPh')}
        placeholderTextColor={colors.textMuted}
        style={styles.textArea}
      />

      <Button title={submitLabel} iconRight="arrow-forward" onPress={submit} loading={submitting} style={{ marginTop: space.xl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: 80 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: space.md },
  row: { flexDirection: 'row', gap: space.md },
  half: { flex: 1 },
  hint: { color: colors.textMuted, marginBottom: space.sm, fontSize: 13 },
  totalBox: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    padding: space.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: { color: colors.primaryDark, fontWeight: '600', flex: 1 },
  total: { color: colors.primaryDark, fontWeight: '800', fontSize: 18 },
  mapBox: {
    height: 220,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  privacy: { color: colors.textMuted, fontSize: 12, marginTop: space.xs },
  error: { color: colors.danger, marginTop: space.xs },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: space.xs, marginTop: space.sm },
  textArea: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space.md,
    fontSize: 16,
    backgroundColor: colors.card,
    color: colors.text,
    textAlignVertical: 'top',
  },
});
