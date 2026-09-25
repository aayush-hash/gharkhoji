// The 6-digit SMS code (sign-up step 3, or forgot password). Auto-submits, shakes on a
// wrong code, resend after 60s. Success gives a one-time ticket for the next screen.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useRequestOtp, useVerifyOtp } from '../../api/hooks';
import { Button, Icon, OtpInput, useErrorText } from '../../components/ui';
import { type AuthMode, prettyPhone, useAuthFlow } from '../../lib/authFlow';
import { colors, font, radius, space } from '../../lib/theme';

const RESEND_SECONDS = 60;

export default function VerifyScreen() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const { mode: modeParam } = useLocalSearchParams<{ mode?: AuthMode }>();
  const mode: AuthMode = modeParam === 'reset' ? 'reset' : 'signup';
  const phone = useAuthFlow((s) => s.phone);
  const setVerified = useAuthFlow((s) => s.setVerified);
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
      { phone, code: value, purpose: mode },
      {
        onSuccess: (res) => {
          setVerified(res.verification_token);
          router.replace(mode === 'reset' ? '/auth/new-password' : '/auth/profile');
        },
        onError: () => setCode(''),
      },
    );
  };

  const pretty = prettyPhone(phone);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.iconCircle}>
            <Icon name="chatbubble-ellipses" size={30} color={colors.primary} />
          </View>
          {mode === 'signup' ? <Text style={styles.step}>{t('auth.step', { n: 3, total: 4 })}</Text> : null}
          <Text style={styles.title}>{t('auth.verifyTitle')}</Text>
          <View style={styles.sentRow}>
            <Text style={styles.subtitle}>{t('auth.sentTo')} </Text>
            <Text style={styles.phone}>{pretty}</Text>
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Text style={styles.change}> · {t('auth.change')}</Text>
            </Pressable>
          </View>

          <OtpInput
            value={code}
            onChange={(v) => {
              setCode(v);
              if (verify.isError) verify.reset();
              if (v.length === 6) submit(v);
            }}
            error={verify.isError}
          />
          {verify.isError ? <Text style={styles.error}>{errorText(verify.error)}</Text> : null}

          <View style={styles.resend}>
            {secondsLeft > 0 ? (
              <Text style={styles.muted}>{t('auth.resendIn', { seconds: secondsLeft })}</Text>
            ) : (
              <Pressable
                disabled={resend.isPending}
                onPress={() => resend.mutate({ phone, purpose: mode }, { onSuccess: () => setSecondsLeft(RESEND_SECONDS) })}>
                <Text style={styles.resendLink}>{t('auth.resend')}</Text>
              </Pressable>
            )}
          </View>
          {resend.isError ? <Text style={styles.error}>{errorText(resend.error)}</Text> : null}
        </ScrollView>

        <View style={styles.footer}>
          <Button title={t('auth.verify')} onPress={() => submit()} loading={verify.isPending} disabled={code.length !== 6} />
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
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.lg,
  },
  step: { ...font.tiny, color: colors.primary, textTransform: 'uppercase', marginBottom: space.sm },
  title: { ...font.h1, color: colors.text },
  sentRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: space.sm, marginBottom: space.xxl },
  subtitle: { ...font.body, color: colors.textSecondary },
  phone: { ...font.bodyStrong, color: colors.text },
  change: { ...font.bodyStrong, color: colors.primary },
  error: { color: colors.danger, marginTop: space.md, textAlign: 'center', ...font.small },
  resend: { alignItems: 'center', marginTop: space.xxl },
  muted: { ...font.body, color: colors.textMuted },
  resendLink: { ...font.bodyStrong, color: colors.primary },
  footer: { padding: space.xl, paddingTop: space.md },
});
