// GharKhoji UI kit — every screen is built from these pieces, so the app looks consistent.
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { type ComponentProps, type ReactNode, type Ref, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { ApiError } from '../lib/api';
import { colors, font, radius, shadow, space } from '../lib/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 20, color = colors.text }: { name: IconName; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} />;
}

export const tap = () => {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
};

// ---------------------------------------------------------------- Buttons

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'accent';

export function Button({
  title,
  onPress,
  loading,
  disabled,
  variant = 'primary',
  size = 'lg',
  icon,
  iconRight,
  style,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: ButtonVariant;
  size?: 'md' | 'lg';
  icon?: IconName;
  iconRight?: IconName;
  style?: ViewStyle;
}) {
  const isDisabled = disabled || loading;
  const v = buttonVariants[variant];
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        size === 'md' && styles.buttonMd,
        { backgroundColor: v.bg, borderColor: v.border },
        variant === 'primary' && shadow(1),
        isDisabled && { opacity: 0.45 },
        pressed && { opacity: 0.85, transform: [{ scale: 0.985 }] },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <View style={styles.buttonInner}>
          {icon ? <Ionicons name={icon} size={size === 'md' ? 17 : 19} color={v.fg} /> : null}
          <Text style={[styles.buttonText, size === 'md' && { fontSize: 14 }, { color: v.fg }]} numberOfLines={1}>
            {title}
          </Text>
          {iconRight ? <Ionicons name={iconRight} size={size === 'md' ? 17 : 19} color={v.fg} /> : null}
        </View>
      )}
    </Pressable>
  );
}

const buttonVariants: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.primary, fg: '#fff', border: colors.primary },
  accent: { bg: colors.accent, fg: '#fff', border: colors.accent },
  secondary: { bg: colors.primarySoft, fg: colors.primaryDark, border: colors.primarySoft },
  outline: { bg: 'transparent', fg: colors.primary, border: colors.primary },
  ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
  danger: { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerSoft },
};

export function IconButton({
  name,
  onPress,
  color = colors.text,
  bg = colors.card,
  size = 40,
  style,
  accessibilityLabel,
}: {
  name: IconName;
  onPress: () => void;
  color?: string;
  bg?: string;
  size?: number;
  style?: ViewStyle;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
        styles.center,
        pressed && { opacity: 0.7 },
        style,
      ]}>
      <Ionicons name={name} size={size * 0.5} color={color} />
    </Pressable>
  );
}

// ---------------------------------------------------------------- Inputs

export function Field({
  label,
  error,
  hint,
  icon,
  prefix,
  right,
  style,
  ...props
}: TextInputProps & {
  label?: string;
  error?: string | null;
  hint?: string;
  icon?: IconName;
  prefix?: string;
  right?: ReactNode;
  ref?: Ref<TextInput>; // React 19: passed straight through to the TextInput
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[{ marginBottom: space.lg }, style as ViewStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View
        style={[
          styles.inputBox,
          focused && { borderColor: colors.primary, backgroundColor: '#fff' },
          error ? { borderColor: colors.danger } : null,
        ]}>
        {icon ? <Ionicons name={icon} size={19} color={focused ? colors.primary : colors.textMuted} /> : null}
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
        <TextInput
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          {...props}
        />
        {right}
      </View>
      {error ? (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle" size={14} color={colors.danger} />
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

/** Password input with a show/hide eye. `isNew` turns on iOS "Suggest strong password". */
export function PasswordField({
  isNew = false,
  ...props
}: ComponentProps<typeof Field> & { isNew?: boolean }) {
  const [visible, setVisible] = useState(false);
  return (
    <Field
      icon="lock-closed-outline"
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      textContentType={isNew ? 'newPassword' : 'password'}
      autoComplete={isNew ? 'new-password' : 'current-password'}
      passwordRules="minlength: 8; required: lower; required: digit;"
      right={
        <Pressable
          onPress={() => setVisible((v) => !v)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}>
          <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
        </Pressable>
      }
      {...props}
    />
  );
}

/** Live checklist + strength bar under a new-password field. Rules match the server. */
export function PasswordStrength({ checks, score }: { checks: { label: string; ok: boolean }[]; score: number }) {
  const barColors = [colors.danger, colors.danger, colors.stale, colors.primary, colors.fresh];
  return (
    <View style={{ marginTop: -space.sm, marginBottom: space.lg }}>
      <View style={{ flexDirection: 'row', gap: 4, marginBottom: space.sm }}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              backgroundColor: i < score ? barColors[score] : colors.border,
            }}
          />
        ))}
      </View>
      {checks.map((c) => (
        <View key={c.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
          <Ionicons
            name={c.ok ? 'checkmark-circle' : 'ellipse-outline'}
            size={15}
            color={c.ok ? colors.fresh : colors.textMuted}
          />
          <Text style={{ ...font.small, color: c.ok ? colors.text : colors.textMuted }}>{c.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** Six separate boxes for the SMS code. Supports paste and iOS "From Messages" autofill. */
export function OtpInput({
  value,
  onChange,
  length = 6,
  error,
  autoFocus = true,
}: {
  value: string;
  onChange: (v: string) => void;
  length?: number;
  error?: boolean;
  autoFocus?: boolean;
}) {
  const ref = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const shake = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!error) return;
    Animated.sequence(
      [10, -10, 8, -8, 0].map((toValue) => Animated.timing(shake, { toValue, duration: 50, useNativeDriver: true })),
    ).start();
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  }, [error, shake]);

  return (
    <Pressable onPress={() => ref.current?.focus()}>
      <Animated.View style={[styles.otpRow, { transform: [{ translateX: shake }] }]}>
        {Array.from({ length }).map((_, i) => {
          const char = value[i] ?? '';
          const active = focused && (i === value.length || (i === length - 1 && value.length === length));
          return (
            <View
              key={i}
              style={[
                styles.otpBox,
                char ? styles.otpFilled : null,
                active ? styles.otpActive : null,
                error ? { borderColor: colors.danger } : null,
              ]}>
              <Text style={styles.otpChar}>{char}</Text>
            </View>
          );
        })}
      </Animated.View>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(v) => onChange(v.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={length}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={styles.hiddenInput}
        caretHidden
      />
    </Pressable>
  );
}

// ---------------------------------------------------------------- Chips, badges, cards

export function Chip({
  label,
  selected,
  onPress,
  icon,
  style,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: IconName;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && { opacity: 0.8 }, style]}>
      {icon ? <Ionicons name={icon} size={15} color={selected ? '#fff' : colors.textSecondary} /> : null}
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export function Badge({ label, color, bg, icon }: { label: string; color: string; bg: string; icon?: IconName }) {
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      {icon ? <Ionicons name={icon} size={12} color={color} /> : null}
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

export function Card({ children, style, padded = true }: { children: ReactNode; style?: ViewStyle; padded?: boolean }) {
  return <View style={[styles.card, padded && { padding: space.lg }, shadow(1), style]}>{children}</View>;
}

export function SectionTitle({ children, style }: { children: ReactNode; style?: TextStyle }) {
  return <Text style={[styles.sectionTitle, style]}>{children}</Text>;
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderTitle}>{title}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={8} style={styles.sectionAction}>
          <Text style={styles.sectionActionText}>{action}</Text>
          <Ionicons name="chevron-forward" size={15} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function Avatar({ name, size = 56 }: { name?: string | null; size?: number }) {
  const initials = (name ?? '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  return (
    <View style={[styles.center, { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primary }]}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.38 }}>{initials || '?'}</Text>
    </View>
  );
}

// ---------------------------------------------------------------- Feedback: loading / empty / error

/** A grey placeholder that gently pulses while content loads. */
export function Skeleton({ width, height, radius: r = radius.md, style }: {
  width: number | `${number}%`;
  height: number;
  radius?: number;
  style?: ViewStyle;
}) {
  const pulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return <Animated.View style={[{ width, height, borderRadius: r, backgroundColor: '#E4E7EC', opacity: pulse }, style]} />;
}

export function EmptyState({
  icon,
  title,
  text,
  action,
  onAction,
}: {
  icon: IconName;
  title: string;
  text?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={34} color={colors.primary} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {text ? <Text style={styles.emptyText}>{text}</Text> : null}
      {action && onAction ? (
        <Button title={action} onPress={onAction} size="md" style={{ marginTop: space.lg, alignSelf: 'center' }} />
      ) : null}
    </View>
  );
}

/** Turns any error into a friendly, translated sentence. */
export function useErrorText() {
  const { t } = useTranslation();
  return (err: unknown): string => {
    if (err instanceof ApiError) return err.status === 0 ? t('common.networkError') : err.message;
    if (err instanceof Error && err.message && !err.message.includes('permission')) return err.message;
    return t('common.somethingWrong');
  };
}

export function ErrorView({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  const toText = useErrorText();
  return (
    <EmptyState
      icon="cloud-offline-outline"
      title={t('common.somethingWrong')}
      text={toText(error)}
      action={onRetry ? t('common.retry') : undefined}
      onAction={onRetry}
    />
  );
}

export function Loading() {
  return (
    <View style={[styles.center, { flex: 1, padding: space.xl }]}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  button: {
    height: 54,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    borderWidth: 1.5,
  },
  buttonMd: { height: 44, borderRadius: radius.md, paddingHorizontal: space.lg },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  buttonText: { fontSize: 16, fontWeight: '700' },
  label: { ...font.smallStrong, color: colors.textSecondary, marginBottom: space.xs + 2 },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: 54,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: space.md + 2,
    backgroundColor: '#FAFBFC',
  },
  prefix: { ...font.bodyStrong, color: colors.text, paddingRight: space.sm, borderRightWidth: 1, borderRightColor: colors.border },
  input: { flex: 1, fontSize: 16, color: colors.text, height: '100%' },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: space.xs + 2 },
  error: { color: colors.danger, fontSize: 13 },
  hint: { color: colors.textMuted, fontSize: 12, marginTop: space.xs + 2 },
  otpRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  otpBox: {
    flex: 1,
    maxWidth: 56,
    aspectRatio: 0.86,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: '#FAFBFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpFilled: { borderColor: colors.primaryTint, backgroundColor: colors.primarySoft },
  otpActive: { borderColor: colors.primary, backgroundColor: '#fff' },
  otpChar: { fontSize: 24, fontWeight: '800', color: colors.text },
  hiddenInput: { position: 'absolute', opacity: 0, width: 1, height: 1 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md + 2,
    paddingVertical: space.sm + 1,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    marginRight: space.sm,
    marginBottom: space.sm,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...font.smallStrong, color: colors.textSecondary },
  chipTextSelected: { color: '#fff' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: 12, fontWeight: '700' },
  card: { backgroundColor: colors.card, borderRadius: radius.xl },
  sectionTitle: { ...font.h3, color: colors.text, marginBottom: space.sm, marginTop: space.xl },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: space.xxl,
    marginBottom: space.md,
  },
  sectionHeaderTitle: { ...font.h2, color: colors.text },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  sectionActionText: { ...font.smallStrong, color: colors.primary },
  empty: { alignItems: 'center', justifyContent: 'center', padding: space.xxl, flex: 1 },
  emptyIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.lg,
  },
  emptyTitle: { ...font.h3, color: colors.text, textAlign: 'center' },
  emptyText: { ...font.body, color: colors.textSecondary, textAlign: 'center', marginTop: space.xs, lineHeight: 21 },
});
