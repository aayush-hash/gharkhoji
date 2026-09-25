import { router } from 'expo-router';
import { FlatList, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { ListingCard, ListingCardSkeleton } from '../../components/ListingCard';
import { EmptyState, ErrorView } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { useSavedListings } from '../../lib/favorites';
import { colors, font, space } from '../../lib/theme';

export default function Saved() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const user = useAuth((s) => s.user);
  const query = useSavedListings();
  const columns = width >= 700 ? 2 : 1;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('saved.title')}</Text>
        {query.data?.length ? <Text style={styles.count}>{t('saved.count', { count: query.data.length })}</Text> : null}
      </View>

      {!user ? (
        <EmptyState
          icon="heart"
          title={t('saved.guestTitle')}
          text={t('saved.guestText')}
          action={t('profile.login')}
          onAction={() => router.push('/auth/login')}
        />
      ) : query.isLoading ? (
        <View style={styles.list}>
          <ListingCardSkeleton />
          <ListingCardSkeleton />
        </View>
      ) : query.isError ? (
        <ErrorView error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <FlatList
          key={columns}
          data={query.data}
          numColumns={columns}
          keyExtractor={(i) => i.id}
          columnWrapperStyle={columns > 1 ? { gap: space.lg } : undefined}
          renderItem={({ item }) => (
            <View style={{ flex: 1 }}>
              {item.status !== 'active' ? (
                <Text style={styles.gone}>{t('saved.noLongerAvailable')}</Text>
              ) : null}
              <View style={item.status !== 'active' ? { opacity: 0.55 } : null}>
                <ListingCard item={item} />
              </View>
            </View>
          )}
          contentContainerStyle={[styles.list, { flexGrow: 1 }]}
          refreshing={query.isRefetching}
          onRefresh={() => query.refetch()}
          ListEmptyComponent={
            <EmptyState
              icon="heart-outline"
              title={t('saved.emptyTitle')}
              text={t('saved.emptyText')}
              action={t('saved.explore')}
              onAction={() => router.push('/(tabs)')}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm },
  title: { ...font.h1, color: colors.text },
  count: { ...font.small, color: colors.textMuted, marginTop: 2 },
  list: { padding: space.lg, paddingBottom: 120 },
  gone: { ...font.smallStrong, color: colors.danger, marginBottom: space.xs },
});
