import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useRequestOtp, useVerifyOtp } from '../api/hooks';
import { Button, useErrorText } from '../components/ui';
import { colors, radius, space } from '../lib/theme';

const RESEND_SECONDS = 60;

export default function Verify() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const verify = useVerifyOtp();
  const resend = useRequestOtp();

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const submit = (value = code) => {
    if (value.length !== 6 || verify.isPending) return;
    verify.mutate(
      { phone, code: value },
      {
        onSuccess: (res) => {
          // Close the login screens; new users go to onboarding first.
          router.dismissAll();
          router.replace(res.user.onboarding_completed ? '/(tabs)/profile' : '/onboarding');
        },
      },
    );
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={styles.title}>🔐 {t('auth.verifyTitle')}</Text>
      <Text style={styles.hint}>{t('auth.verifyHint', { phone: `+977 ${phone}` })}</Text>

      <TextInput
        value={code}
        onChangeText={(v) => {
          const digits = v.replace(/\D/g, '').slice(0, 6);
          setCode(digits);
          if (digits.length === 6) submit(digits); // auto-submit when complete
        }}
        keyboardType="number-pad"
        textContentType="oneTimeCode" // iOS suggests the code from SMS
        autoComplete="sms-otp"
        maxLength={6}
        autoFocus
        style={styles.codeInput}
        placeholder="––––––"
        placeholderTextColor={colors.border}
      />
      {verify.isError ? <Text style={styles.error}>{errorText(verify.error)}</Text> : null}

      <Button title={t('auth.verify')} onPress={() => submit()} loading={verify.isPending} disabled={code.length !== 6} />

      <View style={{ marginTop: space.xl, alignItems: 'center' }}>
        {secondsLeft > 0 ? (
          <Text style={styles.muted}>{t('auth.resendIn', { seconds: secondsLeft })}</Text>
        ) : (
          <Button
            title={t('auth.resend')}
            variant="ghost"
            loading={resend.isPending}
            onPress={() => resend.mutate(phone, { onSuccess: () => setSecondsLeft(RESEND_SECONDS) })}
          />
        )}
        {resend.isError ? <Text style={styles.error}>{errorText(resend.error)}</Text> : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: space.xl, backgroundColor: colors.bg },
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  hint: { color: colors.textMuted, marginTop: space.xs, marginBottom: space.xl },
  codeInput: {
    height: 64,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.md,
    fontSize: 32,
    letterSpacing: 12,
    textAlign: 'center',
    backgroundColor: colors.card,
    color: colors.text,
    marginBottom: space.md,
  },
  error: { color: colors.danger, marginBottom: space.md, textAlign: 'center' },
  muted: { color: colors.textMuted },
});
