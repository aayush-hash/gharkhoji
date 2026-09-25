// Sign-up step 4 of 4: name, account type and password. Creates the account and logs in.
// Pre-selects the role chosen on "How will you use GharKhoji?".
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, type TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useRegister } from '../../api/hooks';
import { RoleCard } from '../../components/RoleCard';
import { Button, EmptyState, Field, Icon, PasswordField, PasswordStrength, useErrorText } from '../../components/ui';
import { useAuthFlow } from '../../lib/authFlow';
import { checkPassword } from '../../lib/password';
import { usePrefs } from '../../lib/prefs';
import { colors, font, radius, space } from '../../lib/theme';
import type { Role } from '../../lib/types';

export default function CreateAccount() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const intendedRole = usePrefs((s) => s.intendedRole);
  const finishOnboarding = usePrefs((s) => s.finishOnboarding);
  const token = useAuthFlow((s) => s.verificationToken);
  const clearFlow = useAuthFlow((s) => s.clear);
  const [name, setName] = useState('');
  const [role, setRole] = useState<Exclude<Role, 'admin'>>(intendedRole);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const register = useRegister();

  const strength = checkPassword(password, t);
  const nameValid = name.trim().length >= 2;
  const matches = password === confirm;
  const valid = nameValid && strength.valid && matches;

  if (!token) {
    // e.g. the app was closed mid-way: the verification ticket lives only in memory
    return (
      <EmptyState
        icon="time-outline"
        title={t('auth.expiredTitle')}
        text={t('auth.expiredText')}
        action={t('common.startAgain')}
        onAction={() => router.replace('/auth/role')}
      />
    );
  }

  const finish = () => {
    setTouched(true);
    if (!valid) return;
    register.mutate(
      { verification_token: token, full_name: name.trim(), role, password },
      {
        onSuccess: async () => {
          clearFlow();
          await finishOnboarding();
          router.dismissAll();
          router.replace(role === 'tenant' ? '/(tabs)' : '/(tabs)/mine');
        },
      },
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.verified}>
            <Icon name="checkmark-circle" size={16} color={colors.fresh} />
            <Text style={styles.verifiedText}>{t('auth.numberVerified')}</Text>
          </View>
          <Text style={styles.step}>{t('auth.step', { n: 4, total: 4 })}</Text>
          <Text style={styles.title}>{t('onboarding.title')}</Text>
          <Text style={styles.subtitle}>{t('onboarding.subtitle')}</Text>

          <Field
            label={t('onboarding.name')}
            icon="person-outline"
            value={name}
            onChangeText={setName}
            placeholder={t('onboarding.namePlaceholder')}
            autoCapitalize="words"
            textContentType="name"
            autoComplete="name"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            error={touched && !nameValid ? t('onboarding.nameRequired') : null}
          />

          <Text style={styles.label}>{t('onboarding.iAm')}</Text>
          {(['tenant', 'owner', 'agent'] as const).map((r) => (
            <RoleCard key={r} role={r} compact selected={role === r} onPress={() => setRole(r)} />
          ))}
          {role !== 'tenant' ? <Text style={styles.note}>{t('onboarding.roleNote')}</Text> : null}

          <View style={styles.divider} />
          <Text style={styles.sectionTitle}>{t('password.createTitle')}</Text>
          <Text style={styles.sectionHint}>{t('password.createHint')}</Text>

          <PasswordField
            ref={passwordRef}
            isNew
            label={t('password.label')}
            value={password}
            onChangeText={setPassword}
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
            error={touched && !strength.valid ? t('password.tooWeak') : null}
          />
          {password ? <PasswordStrength checks={strength.checks} score={strength.score} /> : null}
          <PasswordField
            ref={confirmRef}
            isNew
            label={t('password.confirm')}
            value={confirm}
            onChangeText={setConfirm}
            returnKeyType="done"
            onSubmitEditing={finish}
            error={(touched || confirm.length >= password.length) && confirm && !matches ? t('password.mismatch') : null}
          />

          {register.isError ? <Text style={styles.error}>{errorText(register.error)}</Text> : null}
        </ScrollView>
        <View style={styles.footer}>
          <Button title={t('auth.createAccount')} icon="checkmark" onPress={finish} loading={register.isPending} />
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.xl, paddingTop: space.sm },
  verified: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: colors.freshBg,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    marginBottom: space.lg,
  },
  verifiedText: { ...font.smallStrong, color: colors.fresh },
  step: { ...font.tiny, color: colors.primary, textTransform: 'uppercase', marginBottom: space.sm },
  title: { ...font.h1, color: colors.text },
  subtitle: { ...font.body, color: colors.textSecondary, marginTop: space.sm, marginBottom: space.xxl, lineHeight: 22 },
  label: { ...font.smallStrong, color: colors.textSecondary, marginBottom: space.sm },
  note: { ...font.small, color: colors.textMuted, marginTop: space.xs },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: space.xl },
  sectionTitle: { ...font.h3, color: colors.text },
  sectionHint: { ...font.small, color: colors.textSecondary, marginTop: 4, marginBottom: space.lg, lineHeight: 19 },
  error: { color: colors.danger, marginTop: space.md, ...font.small },
  footer: { padding: space.xl, paddingTop: space.md },
});
