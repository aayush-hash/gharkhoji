// Phone number (Nepal +977) → we text a 6-digit code.
// mode=signup: step 2 of sign-up (verifies the number once, forever)
// mode=reset:  "Forgot password" — proves it's you before setting a new password
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useRequestOtp } from '../../api/hooks';
import { Button, Field, Icon, useErrorText } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { type AuthMode, useAuthFlow } from '../../lib/authFlow';
import { usePrefs } from '../../lib/prefs';
import { colors, font, radius, space } from '../../lib/theme';

export default function PhoneScreen() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const { mode: modeParam } = useLocalSearchParams<{ mode?: AuthMode }>();
  const mode: AuthMode = modeParam === 'reset' ? 'reset' : 'signup';
  const isReset = mode === 'reset';
  const finishOnboarding = usePrefs((s) => s.finishOnboarding);
  const flowPhone = useAuthFlow((s) => s.phone);
  const setFlowPhone = useAuthFlow((s) => s.setPhone);
  const [phone, setPhone] = useState(flowPhone);
  const [touched, setTouched] = useState(false);
  const requestOtp = useRequestOtp();

  const digits = phone.replace(/\D/g, '');
  const valid = /^9[78]\d{8}$/.test(digits);
  const status = requestOtp.error instanceof ApiError ? requestOtp.error.status : null;
  // signup + 409 = number already registered; reset + 404 = no such account
  const wrongDoor = (!isReset && status === 409) || (isReset && status === 404);

  const submit = () => {
    setTouched(true);
    if (!valid) return;
    requestOtp.mutate(
      { phone: digits, purpose: mode },
      {
        onSuccess: () => {
          setFlowPhone(digits);
          router.push({ pathname: '/auth/verify', params: { mode } });
        },
      },
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={[styles.iconCircle, isReset && { backgroundColor: colors.accentSoft }]}>
            <Icon name={isReset ? 'key' : 'phone-portrait'} size={28} color={isReset ? colors.accent : colors.primary} />
          </View>
          {!isReset ? <Text style={styles.step}>{t('auth.step', { n: 2, total: 4 })}</Text> : null}
          <Text style={styles.title}>{isReset ? t('reset.title') : t('auth.phoneTitle')}</Text>
          <Text style={styles.subtitle}>{isReset ? t('reset.subtitle') : t('auth.signupHint')}</Text>

          <Field
            label={t('auth.phone')}
            prefix="🇳🇵 +977"
            value={phone}
            onChangeText={(v) => {
              setPhone(v);
              if (requestOtp.isError) requestOtp.reset();
            }}
            keyboardType="number-pad"
            maxLength={10}
            placeholder="98XXXXXXXX"
            autoFocus
            textContentType="telephoneNumber"
            autoComplete="tel"
            onSubmitEditing={submit}
            error={
              touched && !valid
                ? t('auth.invalidPhone')
                : requestOtp.isError && !wrongDoor
                  ? errorText(requestOtp.error)
                  : null
            }
          />

          {wrongDoor ? (
            <View style={styles.alert}>
              <Ionicons name="information-circle" size={20} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.alertText}>{isReset ? t('reset.noAccount') : t('auth.alreadyRegistered')}</Text>
                <Pressable
                  hitSlop={6}
                  onPress={() => {
                    setFlowPhone(digits);
                    router.replace(isReset ? '/auth/role' : '/auth/login');
                  }}>
                  <Text style={styles.link}>{isReset ? t('login.createAccount') : t('auth.loginInstead')} →</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <View style={styles.secure}>
            <Ionicons name="lock-closed" size={14} color={colors.textMuted} />
            <Text style={styles.secureText}>{t('auth.privacy')}</Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Button title={t('auth.sendCode')} icon="chatbubble-ellipses" onPress={submit} loading={requestOtp.isPending} />
          {!isReset ? (
            <Button
              title={t('auth.guest')}
              variant="ghost"
              onPress={async () => {
                await finishOnboarding();
                router.dismissAll();
                router.replace('/(tabs)');
              }}
              style={{ marginTop: space.xs }}
            />
          ) : null}
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
  subtitle: { ...font.body, color: colors.textSecondary, marginTop: space.sm, marginBottom: space.xxl, lineHeight: 22 },
  alert: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    marginBottom: space.lg,
  },
  alertText: { ...font.small, color: colors.text, lineHeight: 19, marginBottom: 4 },
  link: { ...font.bodyStrong, color: colors.primary },
  secure: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  secureText: { ...font.small, color: colors.textMuted, flex: 1, lineHeight: 18 },
  footer: { padding: space.xl, paddingTop: space.md },
});
