// "Report this room" bottom sheet: pick a reason, add optional details, send.
// Reports go to the admin panel. The owner never sees who reported them. Needs a logged-in user.
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { api, ApiError } from '../lib/api';
import { colors, font, radius, space } from '../lib/theme';
import { Button, tap, useErrorText } from './ui';

const REASONS = [
  { key: 'fake', icon: 'images-outline' },
  { key: 'already_rented', icon: 'key-outline' },
  { key: 'wrong_price', icon: 'cash-outline' },
  { key: 'scam', icon: 'warning-outline' },
  { key: 'broker', icon: 'briefcase-outline' },
  { key: 'offensive', icon: 'hand-left-outline' },
  { key: 'other', icon: 'ellipsis-horizontal-circle-outline' },
] as const;
type Reason = (typeof REASONS)[number]['key'];

export function ReportSheet({ listingId, visible, onClose }: { listingId: string; visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState<Reason | null>(null);
  const [details, setDetails] = useState('');
  const send = useMutation({
    mutationFn: () =>
      api<{ message: string }>(`/reports/listings/${listingId}`, {
        method: 'POST',
        body: { reason, details: details.trim() || null },
      }),
  });
  const already = send.error instanceof ApiError && send.error.status === 409;
  const done = send.isSuccess || already;

  const close = () => {
    onClose();
    // reset after the closing animation
    setTimeout(() => {
      setReason(null);
      setDetails('');
      send.reset();
    }, 300);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel={t('common.cancel')} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wrap}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.lg) }]}>
          <View style={styles.handle} />
          {done ? (
            <View style={styles.done}>
              <View style={styles.doneIcon}>
                <Ionicons name={already ? 'time' : 'checkmark'} size={34} color={colors.fresh} />
              </View>
              <Text style={styles.title}>{already ? t('report.alreadyTitle') : t('report.thanksTitle')}</Text>
              <Text style={styles.text}>{already ? t('report.alreadyText') : t('report.thanksText')}</Text>
              <Button title={t('report.close')} onPress={close} style={{ alignSelf: 'stretch', marginTop: space.lg }} />
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.title}>{t('report.title')}</Text>
              <Text style={styles.text}>{t('report.subtitle')}</Text>
              {REASONS.map((r) => {
                const selected = reason === r.key;
                return (
                  <Pressable
                    key={r.key}
                    onPress={() => {
                      tap();
                      setReason(r.key);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    style={[styles.option, selected && styles.optionSelected]}>
                    <Ionicons name={r.icon} size={20} color={selected ? colors.danger : colors.textSecondary} />
                    <Text style={[styles.optionText, selected && { color: colors.text }]}>{t(`report.reasons.${r.key}`)}</Text>
                    <Ionicons
                      name={selected ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={selected ? colors.danger : colors.border}
                    />
                  </Pressable>
                );
              })}
              {reason ? (
                <TextInput
                  value={details}
                  onChangeText={setDetails}
                  placeholder={t('report.detailsPlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  multiline
                  maxLength={500}
                  style={styles.details}
                />
              ) : null}
              {send.isError && !already ? <Text style={styles.error}>{errorText(send.error)}</Text> : null}
              <Button
                title={t('report.send')}
                icon="flag"
                variant="danger"
                disabled={!reason}
                loading={send.isPending}
                onPress={() => send.mutate()}
                style={{ marginTop: space.md }}
              />
              <Text style={styles.private}>{t('report.private')}</Text>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,27,45,0.45)' },
  wrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
    maxHeight: '88%',
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: space.lg },
  title: { ...font.h2, color: colors.text },
  text: { ...font.body, color: colors.textSecondary, marginTop: space.xs, marginBottom: space.lg, lineHeight: 21 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 13,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: space.sm,
  },
  optionSelected: { borderColor: colors.danger, backgroundColor: '#FDF2F2' },
  optionText: { ...font.body, color: colors.textSecondary, flex: 1 },
  details: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space.md,
    textAlignVertical: 'top',
    color: colors.text,
    ...font.body,
    marginTop: space.xs,
  },
  error: { color: colors.danger, marginTop: space.sm, ...font.small },
  private: { ...font.small, color: colors.textMuted, textAlign: 'center', marginTop: space.md, marginBottom: space.sm },
  done: { alignItems: 'center', paddingVertical: space.lg },
  doneIcon: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: colors.freshBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.lg,
  },
});
