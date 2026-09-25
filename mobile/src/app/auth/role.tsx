// "How will you use GharKhoji?" — room seeker or room owner (agents are a smaller option).
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { RoleCard } from '../../components/RoleCard';
import { Button } from '../../components/ui';
import { usePrefs } from '../../lib/prefs';
import { colors, font, space } from '../../lib/theme';
import type { Role } from '../../lib/types';

type Choice = Exclude<Role, 'admin'>;

export default function ChooseRole() {
  const { t } = useTranslation();
  const initial = usePrefs((s) => s.intendedRole);
  const setIntendedRole = usePrefs((s) => s.setIntendedRole);
  const [role, setRole] = useState<Choice>(initial);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.step}>{t('auth.step', { n: 1, total: 4 })}</Text>
        <Text style={styles.title}>{t('role.title')}</Text>
        <Text style={styles.subtitle}>{t('role.subtitle')}</Text>

        <RoleCard role="tenant" selected={role === 'tenant'} onPress={() => setRole('tenant')} />
        <RoleCard role="owner" selected={role === 'owner'} onPress={() => setRole('owner')} />

        <Text style={styles.or}>{t('role.agentPrompt')}</Text>
        <RoleCard role="agent" compact selected={role === 'agent'} onPress={() => setRole('agent')} />
      </ScrollView>
      <View style={styles.footer}>
        <Button
          title={t('common.continue')}
          iconRight="arrow-forward"
          onPress={() => {
            setIntendedRole(role);
            router.push({ pathname: '/auth/phone', params: { mode: 'signup' } });
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.xl, paddingTop: space.sm },
  step: { ...font.tiny, color: colors.primary, textTransform: 'uppercase', marginBottom: space.sm },
  title: { ...font.h1, color: colors.text },
  subtitle: { ...font.body, color: colors.textSecondary, marginTop: space.sm, marginBottom: space.xxl, lineHeight: 22 },
  or: { ...font.smallStrong, color: colors.textMuted, marginTop: space.lg, marginBottom: space.sm },
  footer: { padding: space.xl, paddingTop: space.md },
});
