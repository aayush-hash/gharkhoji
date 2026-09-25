// Same rules as the server (backend/app/modules/auth/schemas.py), checked live while typing.
// The server always re-checks — this is only for instant feedback.
import type { TFunction } from 'i18next';

const COMMON = new Set([
  'password1', 'password123', 'passw0rd', 'abc12345', 'abcd1234', 'qwerty123', 'qwerty12',
  'iloveyou1', 'welcome1', 'admin123', 'letmein1', 'nepal123', 'kathmandu1', 'gharkhoji1',
  '1q2w3e4r', 'asdf1234', 'zxcv1234', 'test1234', 'hello123', 'pass1234',
]);

export function checkPassword(pw: string, t: TFunction) {
  const longEnough = pw.length >= 8 && pw.length <= 128;
  const letterAndNumber = /[A-Za-z]/.test(pw) && /\d/.test(pw);
  const notCommon = pw.length > 0 && !COMMON.has(pw.toLowerCase()) && new Set(pw).size >= 4;
  const valid = longEnough && letterAndNumber && notCommon;

  let score = 0;
  if (pw.length >= 8) score++;
  if (letterAndNumber) score++;
  if (pw.length >= 12 || /[^A-Za-z0-9]/.test(pw)) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (!valid) score = Math.min(score, 2);

  return {
    valid,
    score: pw ? Math.max(1, score) : 0,
    checks: [
      { label: t('password.ruleLength'), ok: longEnough },
      { label: t('password.ruleMix'), ok: letterAndNumber },
      { label: t('password.ruleCommon'), ok: notCommon },
    ],
  };
}
