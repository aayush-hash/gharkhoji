import { Redirect } from 'expo-router';

import { useAuth } from '../lib/auth';
import { usePrefs } from '../lib/prefs';

/** Decides where the app starts. */
export default function Index() {
  const language = usePrefs((s) => s.language);
  const user = useAuth((s) => s.user);

  if (!language) return <Redirect href="/welcome" />;
  if (user && !user.onboarding_completed) return <Redirect href="/onboarding" />;
  return <Redirect href="/(tabs)" />;
}
