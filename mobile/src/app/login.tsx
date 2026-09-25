import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useRequestOtp } from '../api/hooks';
import { Button, Field, useErrorText } from '../components/ui';
import { colors, space } from '../lib/theme';

export default function Login() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const [phone, setPhone] = useState('');
  const [touched, setTouched] = useState(false);
  const requestOtp = useRequestOtp();

  const digits = phone.replace(/\D/g, '');
  const valid = /^9[78]\d{8}$/.test(digits);

  const submit = () => {
    setTouched(true);
    if (!valid) return;
    requestOtp.mutate(digits, {
      onSuccess: () => router.push({ pathname: '/verify', params: { phone: digits } }),
    });
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View>
        <Text style={styles.title}>📱 {t('auth.loginTitle')}</Text>
        <Text style={styles.hint}>{t('auth.loginHint')}</Text>

        <View style={styles.phoneRow}>
          <Text style={styles.prefix}>🇳🇵 +977</Text>
          <View style={{ flex: 1 }}>
            <Field
              label={t('auth.phone')}
              value={phone}
              onChangeText={setPhone}
              keyboardType="number-pad"
              maxLength={10}
              placeholder="98XXXXXXXX"
              autoFocus
              textContentType="telephoneNumber"
              error={touched && !valid ? t('auth.invalidPhone') : requestOtp.isError ? errorText(requestOtp.error) : null}
              onSubmitEditing={submit}
            />
          </View>
        </View>

        <Button title={t('auth.sendCode')} onPress={submit} loading={requestOtp.isPending} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: space.xl, backgroundColor: colors.bg },
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  hint: { color: colors.textMuted, marginTop: space.xs, marginBottom: space.xl },
  phoneRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  prefix: { fontSize: 17, fontWeight: '600', color: colors.text, marginTop: 38 },
});
