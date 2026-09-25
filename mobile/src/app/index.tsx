import { Redirect } from 'expo-router';

import { useAuth } from '../lib/auth';
import { usePrefs } from '../lib/prefs';

/** Decides where the app starts. */
export default function Index() {
  const onboarded = usePrefs((s) => s.onboarded);
  const user = useAuth((s) => s.user);

  if (!onboarded && !user) return <Redirect href="/welcome" />;
  return <Redirect href="/(tabs)" />;
}
