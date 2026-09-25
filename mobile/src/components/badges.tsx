import { useTranslation } from 'react-i18next';

import { freshness } from '../lib/format';
import { colors } from '../lib/theme';
import type { Role } from '../lib/types';
import { Badge } from './ui';

export function FreshnessBadge({ confirmedAt }: { confirmedAt: string | null }) {
  const { t } = useTranslation();
  const { level, label } = freshness(confirmedAt, t);
  const style = {
    fresh: { color: colors.fresh, bg: colors.freshBg, dot: '🟢' },
    ok: { color: colors.ok, bg: colors.okBg, dot: '🟡' },
    stale: { color: colors.stale, bg: colors.staleBg, dot: '⚪' },
  }[level];
  return <Badge label={`${style.dot} ${label}`} color={style.color} bg={style.bg} />;
}

export function RoleBadge({ role }: { role: Role }) {
  const { t } = useTranslation();
  if (role === 'agent') return <Badge label={`🟠 ${t('roles.agent')}`} color={colors.agent} bg={colors.agentBg} />;
  return <Badge label={`✓ ${t('roles.owner')}`} color={colors.owner} bg={colors.ownerBg} />;
}
