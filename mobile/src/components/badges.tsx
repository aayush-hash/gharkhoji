import { useTranslation } from 'react-i18next';

import { freshness } from '../lib/format';
import { colors } from '../lib/theme';
import type { Role } from '../lib/types';
import { Badge } from './ui';

export function FreshnessBadge({ confirmedAt }: { confirmedAt: string | null }) {
  const { t } = useTranslation();
  const { level, label } = freshness(confirmedAt, t);
  const s = {
    fresh: { color: colors.fresh, bg: colors.freshBg, icon: 'checkmark-circle' as const },
    ok: { color: colors.ok, bg: colors.okBg, icon: 'time' as const },
    stale: { color: colors.stale, bg: colors.staleBg, icon: 'help-circle' as const },
  }[level];
  return <Badge label={label} color={s.color} bg={s.bg} icon={s.icon} />;
}

export function RoleBadge({ role }: { role: Role }) {
  const { t } = useTranslation();
  if (role === 'agent') return <Badge label={t('roles.agent')} color={colors.agent} bg={colors.agentBg} icon="briefcase" />;
  return <Badge label={t('roles.owner')} color={colors.owner} bg={colors.ownerBg} icon="shield-checkmark" />;
}
