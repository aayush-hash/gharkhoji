import { router } from 'expo-router';
import { Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useCreateListing } from '../api/hooks';
import { ListingForm } from '../components/ListingForm';
import { useErrorText } from '../components/ui';

/** Step 1 of posting: details. Step 2 is photos, step 3 publish. */
export default function PostListing() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const create = useCreateListing();

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ListingForm
        submitLabel={t('post.nextPhotos')}
        submitting={create.isPending}
        onSubmit={(data) =>
          create.mutate(data, {
            onSuccess: (listing) => router.replace(`/listing/${listing.id}/photos`),
            onError: (err) => Alert.alert(t('common.somethingWrong'), errorText(err)),
          })
        }
      />
    </KeyboardAvoidingView>
  );
}
