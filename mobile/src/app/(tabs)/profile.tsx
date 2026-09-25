import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useUpdateProfile } from '../../api/hooks';
import { Button, Chip, SectionTitle } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { usePrefs } from '../../lib/prefs';
import { colors, radius, space } from '../../lib/theme';
import type { Language } from '../../lib/types';

export default function Profile() {
  const { t } = useTranslation();
  const user = useAuth((s) => s.user);
  const signOut = useAuth((s) => s.signOut);
  const language = usePrefs((s) => s.language);
  const chooseLanguage = usePrefs((s) => s.chooseLanguage);
  const updateProfile = useUpdateProfile();

  const switchLanguage = async (lang: Language) => {
    await chooseLanguage(lang);
    if (user) updateProfile.mutate({ language: lang }); // keep the server in sync (used for SMS language later)
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t('profile.title')}</Text>

        {user ? (
          <View style={styles.card}>
            <Text style={styles.avatar}>{(user.full_name ?? '?').charAt(0).toUpperCase()}</Text>
            <Text style={styles.name}>{user.full_name ?? '—'}</Text>
            <Text style={styles.muted}>{user.phone}</Text>
            <View style={styles.rolePill}>
              <Text style={styles.roleText}>
                {t('profile.role')}: {t(`roles.${user.role}`)}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={{ fontSize: 40 }}>👋</Text>
            <Text style={styles.name}>{t('profile.guestTitle')}</Text>
            <Text style={[styles.muted, { textAlign: 'center', marginBottom: space.lg }]}>{t('profile.guestText')}</Text>
            <Button title={t('profile.login')} onPress={() => router.push('/login')} style={{ alignSelf: 'stretch' }} />
          </View>
        )}

        <SectionTitle>🌐 {t('profile.language')}</SectionTitle>
        <View style={{ flexDirection: 'row' }}>
          <Chip label="नेपाली" selected={language === 'ne'} onPress={() => switchLanguage('ne')} />
          <Chip label="English" selected={language === 'en'} onPress={() => switchLanguage('en')} />
        </View>

        {user ? (
          <Button title={t('profile.logout')} variant="outline" onPress={signOut} style={{ marginTop: space.xxl }} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: space.lg },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary,
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 64,
    overflow: 'hidden',
  },
  name: { fontSize: 20, fontWeight: '700', color: colors.text, marginTop: space.md },
  muted: { color: colors.textMuted, marginTop: space.xs },
  rolePill: {
    marginTop: space.md,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
  },
  roleText: { color: colors.primaryDark, fontWeight: '600' },
});
