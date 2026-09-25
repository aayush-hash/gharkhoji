// Profile → Change password. Needs the current password; logs out every other phone.
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, type TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useChangePassword } from '../../api/hooks';
import { Button, PasswordField, PasswordStrength, useErrorText } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { checkPassword } from '../../lib/password';
import { colors, font, space } from '../../lib/theme';

export default function ChangePassword() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const newRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const change = useChangePassword();

  const strength = checkPassword(password, t);
  const matches = password === confirm;
  const same = current.length > 0 && current === password;

  const save = () => {
    setTouched(true);
    if (!current || !strength.valid || !matches || same) return;
    change.mutate(
      { current_password: current, password },
      {
        onSuccess: () => {
          Alert.alert(t('changePassword.doneTitle'), t('changePassword.doneText'));
          router.back();
        },
        onError: () => setCurrent(''),
      },
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.subtitle}>{t('changePassword.subtitle')}</Text>
          <PasswordField
            autoFocus
            label={t('password.current')}
            value={current}
            onChangeText={(v) => {
              setCurrent(v);
              if (change.isError) change.reset();
            }}
            returnKeyType="next"
            onSubmitEditing={() => newRef.current?.focus()}
            error={
              change.error instanceof ApiError && change.error.status === 400
                ? t('password.currentWrong')
                : change.isError
                  ? errorText(change.error)
                  : touched && !current ? t('password.required') : null}
          />
          <PasswordField
            ref={newRef}
            isNew
            label={t('password.new')}
            value={password}
            onChangeText={setPassword}
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
            error={
              same ? t('password.sameAsOld') : touched && !strength.valid ? t('password.tooWeak') : null
            }
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
        </ScrollView>
        <View style={styles.footer}>
          <Button title={t('changePassword.save')} icon="checkmark" onPress={save} loading={change.isPending} />
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.xl, paddingTop: space.md },
  subtitle: { ...font.body, color: colors.textSecondary, marginBottom: space.xl, lineHeight: 22 },
  footer: { padding: space.xl, paddingTop: space.md },
});
