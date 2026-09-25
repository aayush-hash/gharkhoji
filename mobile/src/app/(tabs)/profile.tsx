import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useUpdateProfile } from '../../api/hooks';
import { Avatar, Button, tap } from '../../components/ui';
import { API_URL } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { usePrefs } from '../../lib/prefs';
import { colors, font, gradients, radius, shadow, space } from '../../lib/theme';
import type { Language } from '../../lib/types';

type Row = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress: () => void;
  danger?: boolean;
};

function MenuGroup({ rows }: { rows: Row[] }) {
  return (
    <View style={[styles.group, shadow(1)]}>
      {rows.map((r, i) => (
        <Pressable
          key={r.label}
          onPress={() => {
            tap();
            r.onPress();
          }}
          style={({ pressed }) => [styles.row, i > 0 && styles.rowDivider, pressed && { backgroundColor: colors.bg }]}>
          <View style={[styles.rowIcon, r.danger && { backgroundColor: colors.dangerSoft }]}>
            <Ionicons name={r.icon} size={19} color={r.danger ? colors.danger : colors.primary} />
          </View>
          <Text style={[styles.rowLabel, r.danger && { color: colors.danger }]}>{r.label}</Text>
          {r.value ? <Text style={styles.rowValue}>{r.value}</Text> : null}
          {!r.danger ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
        </Pressable>
      ))}
    </View>
  );
}

export default function Profile() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const user = useAuth((s) => s.user);
  const signOut = useAuth((s) => s.signOut);
  const language = usePrefs((s) => s.language) ?? 'en';
  const chooseLanguage = usePrefs((s) => s.chooseLanguage);
  const updateProfile = useUpdateProfile();
  const isOwner = Boolean(user && user.role !== 'tenant');

  const switchLanguage = async () => {
    const next: Language = language === 'ne' ? 'en' : 'ne';
    await chooseLanguage(next);
    if (user) updateProfile.mutate({ language: next });
  };

  const confirmLogout = () =>
    Alert.alert(t('profile.logoutTitle'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.logout'), style: 'destructive', onPress: () => signOut() },
    ]);

  const phone = user?.phone.replace('+977', '+977 ');

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: 120 }}>
      <LinearGradient colors={gradients.hero} style={[styles.header, { paddingTop: insets.top + space.lg }]}>
        {user ? (
          <>
            <View style={styles.avatarRing}>
              <Avatar name={user.full_name} size={76} />
            </View>
            <Text style={styles.name}>{user.full_name ?? '—'}</Text>
            <Text style={styles.phone}>{phone}</Text>
            <View style={styles.rolePill}>
              <Ionicons name={isOwner ? 'home' : 'search'} size={13} color="#fff" />
              <Text style={styles.roleText}>{t(`roles.${user.role}`)}</Text>
              <Ionicons name="checkmark-circle" size={14} color="#3DDC84" />
            </View>
          </>
        ) : (
          <>
            <View style={styles.guestIcon}>
              <Ionicons name="person" size={34} color="#fff" />
            </View>
            <Text style={styles.name}>{t('profile.guestTitle')}</Text>
            <Text style={[styles.phone, { textAlign: 'center' }]}>{t('profile.guestText')}</Text>
          </>
        )}
      </LinearGradient>

      <View style={styles.body}>
        {!user ? (
          <View style={styles.guestActions}>
            <Button title={t('profile.signUp')} icon="person-add" onPress={() => router.push('/auth/role')} />
            <Button title={t('profile.haveAccount')} variant="secondary" onPress={() => router.push('/auth/login')} />
          </View>
        ) : null}

        {user ? (
          <MenuGroup
            rows={[
              ...(isOwner
                ? [
                    { icon: 'albums' as const, label: t('tabs.mine'), onPress: () => router.push('/(tabs)/mine') },
                    { icon: 'add-circle' as const, label: t('post.newTitle'), onPress: () => router.push('/post') },
                  ]
                : [{ icon: 'heart' as const, label: t('saved.title'), onPress: () => router.push('/(tabs)/saved') }]),
              { icon: 'key' as const, label: t('changePassword.title'), onPress: () => router.push('/auth/change-password') },
              ...(user.role === 'admin'
                ? [{
                    icon: 'shield-half' as const,
                    label: t('profile.admin'),
                    // The admin panel is a web page served by the backend: <server>/admin
                    onPress: () => Linking.openURL(API_URL.replace(/\/api\/v1$/, '') + '/admin'),
                  }]
                : []),
            ]}
          />
        ) : null}

        <MenuGroup
          rows={[
            {
              icon: 'language',
              label: t('profile.language'),
              value: language === 'ne' ? 'नेपाली' : 'English',
              onPress: switchLanguage,
            },
            { icon: 'shield-checkmark', label: t('profile.safety'), onPress: () => Alert.alert(t('profile.safety'), t('profile.safetyText')) },
            { icon: 'help-circle', label: t('profile.how'), onPress: () => Alert.alert(t('profile.how'), t('profile.howText')) },
            { icon: 'mail', label: t('profile.contact'), onPress: () => Linking.openURL('mailto:support@gharkhoji.app') },
          ]}
        />

        {user ? <MenuGroup rows={[{ icon: 'log-out', label: t('profile.logout'), onPress: confirmLogout, danger: true }]} /> : null}

        <Text style={styles.version}>GharKhoji v{Constants.expoConfig?.version ?? '1.0.0'} · Made in Nepal 🇳🇵</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    paddingBottom: space.xxxl,
    paddingHorizontal: space.xl,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  avatarRing: { padding: 4, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.25)' },
  guestIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { ...font.h2, color: '#fff', marginTop: space.md },
  phone: { ...font.body, color: colors.primaryTint, marginTop: 2 },
  rolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: space.md,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  roleText: { ...font.smallStrong, color: '#fff' },
  body: { padding: space.lg, marginTop: -space.xl, gap: space.lg },
  guestActions: { gap: space.sm },
  group: { backgroundColor: colors.card, borderRadius: radius.xl, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { ...font.bodyStrong, color: colors.text, flex: 1 },
  rowValue: { ...font.small, color: colors.textMuted },
  version: { ...font.small, color: colors.textMuted, textAlign: 'center', marginTop: space.sm },
});
