import { router, useLocalSearchParams } from 'expo-router';
import { Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useListing, useUpdateListing } from '../../../api/hooks';
import { ListingForm } from '../../../components/ListingForm';
import { ErrorView, Loading, useErrorText } from '../../../components/ui';

export default function EditListing() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const query = useListing(id);
  const update = useUpdateListing(id);

  if (query.isLoading) return <Loading />;
  if (query.isError || !query.data) return <ErrorView error={query.error} onRetry={() => query.refetch()} />;
  const l = query.data;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ListingForm
        initial={{
          listing_type: l.listing_type,
          title: l.title,
          description: l.description,
          rent: l.cost.rent,
          deposit: l.deposit,
          water_charge: l.cost.water,
          waste_charge: l.cost.waste,
          internet_charge: l.cost.internet,
          parking_charge: l.cost.parking,
          agent_commission: l.agent_commission,
          amenities: l.amenities,
          furnishing: l.furnishing,
          floor: l.floor,
          max_occupants: l.max_occupants,
          area: l.area,
          landmark: l.landmark,
          lat: l.exact_location?.lat,
          lng: l.exact_location?.lng,
        }}
        submitLabel={t('post.save')}
        submitting={update.isPending}
        onSubmit={(data) =>
          update.mutate(data, {
            onSuccess: () => router.back(),
            onError: (err) => Alert.alert(t('common.somethingWrong'), errorText(err)),
          })
        }
      />
    </KeyboardAvoidingView>
  );
}
