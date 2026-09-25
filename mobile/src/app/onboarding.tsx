import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useUpdateProfile } from '../api/hooks';
import { Button, Field, useErrorText } from '../components/ui';
import { usePrefs } from '../lib/prefs';
import { colors, radius, space } from '../lib/theme';
import type { Role } from '../lib/types';

const ROLES: { role: Exclude<Role, 'admin'>; emoji: string }[] = [
  { role: 'tenant', emoji: '🔍' },
  { role: 'owner', emoji: '🏠' },
  { role: 'agent', emoji: '🤝' },
];

export default function Onboarding() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const language = usePrefs((s) => s.language) ?? 'en';
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('tenant');
  const update = useUpdateProfile();

  const valid = name.trim().length >= 2;

  const finish = () =>
    update.mutate({ full_name: name.trim(), role, language }, { onSuccess: () => router.replace('/(tabs)') });

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>👋 {t('onboarding.title')}</Text>

        <Field
          label={t('onboarding.name')}
          value={name}
          onChangeText={setName}
          placeholder={t('onboarding.namePlaceholder')}
          autoCapitalize="words"
          textContentType="name"
        />

        <Text style={styles.label}>{t('onboarding.iAm')}</Text>
        {ROLES.map(({ role: r, emoji }) => (
          <Pressable key={r} onPress={() => setRole(r)} style={[styles.roleCard, role === r && styles.roleSelected]}>
            <Text style={styles.roleEmoji}>{emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.roleTitle}>{t(`roles.${r}`)}</Text>
              <Text style={styles.roleDesc}>{t(`onboarding.${r}Desc`)}</Text>
            </View>
            <Text style={styles.radio}>{role === r ? '●' : '○'}</Text>
          </Pressable>
        ))}
        {role !== 'tenant' ? <Text style={styles.note}>ℹ️ {t('onboarding.roleNote')}</Text> : null}

        {update.isError ? <Text style={styles.error}>{errorText(update.error)}</Text> : null}
        <Button
          title={t('onboarding.finish')}
          onPress={finish}
          disabled={!valid}
          loading={update.isPending}
          style={{ marginTop: space.xl }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.xl, backgroundColor: colors.bg },
  title: { fontSize: 24, fontWeight: '800', color: colors.text, marginBottom: space.xl },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: space.sm },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: space.lg,
    marginBottom: space.md,
  },
  roleSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  roleEmoji: { fontSize: 28 },
  roleTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  roleDesc: { color: colors.textMuted, marginTop: 2 },
  radio: { fontSize: 20, color: colors.primary },
  note: { color: colors.textMuted, fontSize: 13 },
  error: { color: colors.danger, marginTop: space.md },
});
