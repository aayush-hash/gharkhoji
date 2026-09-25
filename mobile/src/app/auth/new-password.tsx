// Forgot password, last step: choose a new password. Logs in and signs out every other phone.
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, type TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useResetPassword } from '../../api/hooks';
import { Button, EmptyState, Icon, PasswordField, PasswordStrength, useErrorText } from '../../components/ui';
import { useAuthFlow } from '../../lib/authFlow';
import { checkPassword } from '../../lib/password';
import { usePrefs } from '../../lib/prefs';
import { colors, font, radius, space } from '../../lib/theme';

export default function NewPassword() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const finishOnboarding = usePrefs((s) => s.finishOnboarding);
  const token = useAuthFlow((s) => s.verificationToken);
  const clearFlow = useAuthFlow((s) => s.clear);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const confirmRef = useRef<TextInput>(null);
  const reset = useResetPassword();

  const strength = checkPassword(password, t);
  const matches = password === confirm;

  if (!token) {
    return (
      <EmptyState
        icon="time-outline"
        title={t('auth.expiredTitle')}
        text={t('auth.expiredText')}
        action={t('common.startAgain')}
        onAction={() => router.replace({ pathname: '/auth/phone', params: { mode: 'reset' } })}
      />
    );
  }

  const save = () => {
    setTouched(true);
    if (!strength.valid || !matches) return;
    reset.mutate(
      { verification_token: token, password },
      {
        onSuccess: async (res) => {
          clearFlow();
          await finishOnboarding();
          router.dismissAll();
          router.replace(res.user.role === 'tenant' ? '/(tabs)' : '/(tabs)/mine');
        },
      },
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.iconCircle}>
            <Icon name="lock-open" size={28} color={colors.accent} />
          </View>
          <Text style={styles.title}>{t('reset.newTitle')}</Text>
          <Text style={styles.subtitle}>{t('reset.newSubtitle')}</Text>

          <PasswordField
            isNew
            autoFocus
            label={t('password.new')}
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
            onSubmitEditing={save}
            error={(touched || confirm.length >= password.length) && confirm && !matches ? t('password.mismatch') : null}
          />
          {reset.isError ? <Text style={styles.error}>{errorText(reset.error)}</Text> : null}
        </ScrollView>
        <View style={styles.footer}>
          <Button title={t('reset.save')} icon="checkmark" onPress={save} loading={reset.isPending} />
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.xl, paddingTop: space.sm },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.lg,
  },
  title: { ...font.h1, color: colors.text },
  subtitle: { ...font.body, color: colors.textSecondary, marginTop: space.sm, marginBottom: space.xxl, lineHeight: 22 },
  error: { color: colors.danger, marginTop: space.md, ...font.small },
  footer: { padding: space.xl, paddingTop: space.md },
});
