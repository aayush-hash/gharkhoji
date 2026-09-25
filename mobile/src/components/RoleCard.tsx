import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { colors, font, radius, shadow, space } from '../lib/theme';
import type { Role } from '../lib/types';
import { tap } from './ui';

type Choice = Exclude<Role, 'admin'>;

export function RoleCard({
  role,
  selected,
  onPress,
  compact,
}: {
  role: Choice;
  selected: boolean;
  onPress: () => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const meta = {
    tenant: { icon: 'search' as const, color: colors.primary, bg: colors.primarySoft },
    owner: { icon: 'home' as const, color: colors.accent, bg: colors.accentSoft },
    agent: { icon: 'briefcase' as const, color: colors.agent, bg: colors.agentBg },
  }[role];
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      style={[styles.card, compact && styles.cardCompact, selected && styles.cardSelected, shadow(selected ? 2 : 1)]}>
      <View style={[styles.iconWrap, compact && styles.iconCompact, { backgroundColor: meta.bg }]}>
        <Ionicons name={meta.icon} size={compact ? 22 : 30} color={meta.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.cardTitle, compact && { fontSize: 16 }]}>{t(`role.${role}Title`)}</Text>
        <Text style={styles.cardText}>{t(`role.${role}Text`)}</Text>
      </View>
      <Ionicons
        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
        size={26}
        color={selected ? colors.primary : colors.borderStrong}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: space.xl,
    marginBottom: space.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardCompact: { padding: space.lg },
  cardSelected: { borderColor: colors.primary },
  iconWrap: { width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  iconCompact: { width: 44, height: 44, borderRadius: 14 },
  cardTitle: { ...font.h3, fontSize: 18, color: colors.text },
  cardText: { ...font.small, color: colors.textSecondary, marginTop: 3, lineHeight: 18 },
});
