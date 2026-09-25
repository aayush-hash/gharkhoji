import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { usePrefs } from '../lib/prefs';
import { colors, radius, space } from '../lib/theme';
import type { Language } from '../lib/types';

const OPTIONS: { lang: Language; label: string; sub: string }[] = [
  { lang: 'ne', label: 'नेपाली', sub: 'Nepali' },
  { lang: 'en', label: 'English', sub: 'अंग्रेजी' },
];

/** First launch: pick a language. Shown in both languages on purpose. */
export default function Welcome() {
  const chooseLanguage = usePrefs((s) => s.chooseLanguage);

  const pick = async (lang: Language) => {
    await chooseLanguage(lang);
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.logo}>🏠</Text>
        <Text style={styles.title}>घरखोजी · GharKhoji</Text>
        <Text style={styles.tagline}>आजै खाली भएको साँचो कोठा खोज्नुहोस्।</Text>
        <Text style={styles.tagline}>Find a real room that is actually available today.</Text>
      </View>

      <Text style={styles.choose}>भाषा छान्नुहोस् · Choose your language</Text>
      {OPTIONS.map((o) => (
        <Pressable
          key={o.lang}
          onPress={() => pick(o.lang)}
          style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.primarySoft }]}>
          <Text style={styles.optionLabel}>{o.label}</Text>
          <Text style={styles.optionSub}>{o.sub}</Text>
        </Pressable>
      ))}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: space.xl, justifyContent: 'center' },
  hero: { alignItems: 'center', marginBottom: space.xxl },
  logo: { fontSize: 64 },
  title: { fontSize: 28, fontWeight: '800', color: colors.primaryDark, marginTop: space.md },
  tagline: { color: colors.textMuted, textAlign: 'center', marginTop: space.sm, fontSize: 15 },
  choose: { fontWeight: '600', color: colors.text, marginBottom: space.md, textAlign: 'center' },
  option: {
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.lg,
    padding: space.lg,
    marginBottom: space.md,
    alignItems: 'center',
  },
  optionLabel: { fontSize: 22, fontWeight: '700', color: colors.primaryDark },
  optionSub: { color: colors.textMuted, marginTop: 2 },
});
