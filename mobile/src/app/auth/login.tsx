// Log in: phone + password. No SMS code — codes are only for sign-up and "Forgot password".
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useLogin } from '../../api/hooks';
import { Button, Field, PasswordField, tap, useErrorText } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { useAuthFlow } from '../../lib/authFlow';
import { usePrefs } from '../../lib/prefs';
import { storage } from '../../lib/storage';
import { colors, font, radius, space } from '../../lib/theme';

export default function LoginScreen() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const finishOnboarding = usePrefs((s) => s.finishOnboarding);
  const setFlowPhone = useAuthFlow((s) => s.setPhone);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);
  const passwordRef = useRef<TextInput>(null);
  const login = useLogin();

  // Pre-fill the number used last time on this phone
  useEffect(() => {
    storage.get('lastPhone').then((p) => p && setPhone((cur) => cur || p));
  }, []);

  const digits = phone.replace(/\D/g, '');
  const phoneValid = /^9[78]\d{8}$/.test(digits);
  const status = login.error instanceof ApiError ? login.error.status : null;

  const submit = () => {
    setTouched(true);
    if (!phoneValid || !password) return;
    login.mutate(
      { phone: digits, password },
      {
        onSuccess: async (res) => {
          await finishOnboarding();
          router.dismissAll();
          router.replace(res.user.role === 'tenant' ? '/(tabs)' : '/(tabs)/mine');
        },
        onError: () => {
          setPassword('');
          setTouched(false); // the red box explains what went wrong
        },
      },
    );
  };

  const forgot = () => {
    tap();
    setFlowPhone(phoneValid ? digits : '');
    router.push({ pathname: '/auth/phone', params: { mode: 'reset' } });
  };

  // 401 → translated generic message; 409 → account made before passwords existed
  const attemptsLeft = login.error?.message.match(/(\d+) attempt/)?.[1];
  const loginError =
    status === 401
      ? t('login.wrong') + (attemptsLeft ? ` ${t('login.attemptsLeft', { count: Number(attemptsLeft) })}` : '')
      : status === 409
        ? t('login.noPassword')
        : login.isError
          ? errorText(login.error)
          : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Image source={require('../../assets/logo-color.png')} style={styles.logo} />
          <Text style={styles.title}>{t('login.title')}</Text>
          <Text style={styles.subtitle}>{t('login.subtitle')}</Text>

          <Field
            label={t('auth.phone')}
            prefix="🇳🇵 +977"
            value={phone}
            onChangeText={setPhone}
            keyboardType="number-pad"
            maxLength={10}
            placeholder="98XXXXXXXX"
            textContentType="username"
            autoComplete="username"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            error={touched && !phoneValid ? t('auth.invalidPhone') : null}
          />
          <PasswordField
            ref={passwordRef}
            label={t('password.label')}
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              if (login.isError) login.reset();
            }}
            placeholder="••••••••"
            returnKeyType="go"
            onSubmitEditing={submit}
            error={touched && !password ? t('password.required') : null}
          />

          <Pressable onPress={forgot} hitSlop={8} style={styles.forgot}>
            <Text style={styles.link}>{t('login.forgot')}</Text>
          </Pressable>

          {loginError ? (
            <View style={[styles.alert, status === 429 && styles.alertWarn]}>
              <Ionicons
                name={status === 429 ? 'time' : status === 409 ? 'key' : 'alert-circle'}
                size={18}
                color={status === 429 ? colors.stale : colors.danger}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.alertText}>{loginError}</Text>
                {status === 409 || status === 429 ? (
                  <Pressable onPress={forgot} hitSlop={6}>
                    <Text style={[styles.link, { marginTop: 4 }]}>{t('login.setPasswordNow')} →</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}

          <View style={styles.secure}>
            <Ionicons name="shield-checkmark" size={14} color={colors.textMuted} />
            <Text style={styles.secureText}>{t('login.secure')}</Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Button title={t('login.button')} icon="log-in" onPress={submit} loading={login.isPending} />
          <View style={styles.switchRow}>
            <Text style={styles.muted}>{t('login.newHere')} </Text>
            <Pressable onPress={() => router.replace('/auth/role')} hitSlop={8}>
              <Text style={styles.link}>{t('login.createAccount')}</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.xl, paddingTop: space.sm },
  logo: { width: 52, height: 52, marginBottom: space.lg },
  title: { ...font.h1, color: colors.text },
  subtitle: { ...font.body, color: colors.textSecondary, marginTop: space.sm, marginBottom: space.xxl, lineHeight: 22 },
  forgot: { alignSelf: 'flex-end', marginTop: -space.sm, marginBottom: space.lg },
  link: { ...font.bodyStrong, color: colors.primary },
  alert: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: '#FDECEC',
    marginBottom: space.lg,
  },
  alertWarn: { backgroundColor: colors.staleBg },
  alertText: { ...font.small, color: colors.text, lineHeight: 19 },
  secure: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  secureText: { ...font.small, color: colors.textMuted, flex: 1, lineHeight: 18 },
  footer: { padding: space.xl, paddingTop: space.md },
  switchRow: { flexDirection: 'row', justifyContent: 'center', marginTop: space.lg },
  muted: { ...font.body, color: colors.textSecondary },
});
