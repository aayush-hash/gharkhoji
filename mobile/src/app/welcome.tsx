// First launch: three slides explaining GharKhoji's promise, then sign up or browse.
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Button, tap } from '../components/ui';
import { usePrefs } from '../lib/prefs';
import { colors, font, gradients, radius, shadow, space } from '../lib/theme';

type Slide = {
  key: 'verified' | 'available' | 'transparent';
  icon: keyof typeof Ionicons.glyphMap;
  floating: { icon: keyof typeof Ionicons.glyphMap; text: string; color: string; bg: string }[];
};

export default function Welcome() {
  const { t, i18n } = useTranslation();
  const { width, height } = useWindowDimensions();
  const compact = height < 720; // small phones (e.g. iPhone SE)
  const chooseLanguage = usePrefs((s) => s.chooseLanguage);
  const finishOnboarding = usePrefs((s) => s.finishOnboarding);
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<Slide>>(null);

  const slides: Slide[] = [
    {
      key: 'verified',
      icon: 'shield-checkmark',
      floating: [
        { icon: 'call', text: t('welcome.chipPhone'), color: colors.fresh, bg: colors.freshBg },
        { icon: 'person', text: t('welcome.chipOwner'), color: colors.primary, bg: colors.primarySoft },
      ],
    },
    {
      key: 'available',
      icon: 'time',
      floating: [
        { icon: 'checkmark-circle', text: t('welcome.chipFresh'), color: colors.fresh, bg: colors.freshBg },
        { icon: 'eye-off', text: t('welcome.chipHidden'), color: colors.stale, bg: colors.staleBg },
      ],
    },
    {
      key: 'transparent',
      icon: 'receipt',
      floating: [
        { icon: 'cash', text: t('welcome.chipTotal'), color: colors.primaryDark, bg: colors.primarySoft },
        { icon: 'close-circle', text: t('welcome.chipNoFee'), color: colors.accent, bg: colors.accentSoft },
      ],
    },
  ];

  const isLast = index === slides.length - 1;
  const lang = i18n.language === 'ne' ? 'ne' : 'en';
  const artSize = Math.min(280, width - space.xxl * 2, height * 0.33);

  const next = () => {
    if (isLast) {
      finishOnboarding();
      router.push('/auth/role');
    } else {
      listRef.current?.scrollToIndex({ index: index + 1 });
      setIndex(index + 1);
    }
  };

  const browse = async () => {
    await finishOnboarding();
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <View style={styles.brand}>
          <Image source={require('../assets/logo-color.png')} style={styles.brandLogo} />
          <Text style={styles.brandName}>GharKhoji</Text>
        </View>
        <View style={styles.langToggle}>
          {(['en', 'ne'] as const).map((l) => (
            <Pressable
              key={l}
              onPress={() => {
                tap();
                chooseLanguage(l);
              }}
              style={[styles.langOption, lang === l && styles.langActive]}>
              <Text style={[styles.langText, lang === l && styles.langTextActive]}>{l === 'en' ? 'EN' : 'ने'}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <FlatList
        ref={listRef}
        data={slides}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(s) => s.key}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <View style={[styles.art, { width: artSize, height: artSize }]}>
              <LinearGradient colors={gradients.hero} style={[styles.circle, { width: artSize * 0.68, height: artSize * 0.68 }]}>
                <Ionicons name={item.icon} size={artSize * 0.3} color="#fff" />
              </LinearGradient>
              {item.floating.map((f, i) => (
                <View key={f.text} style={[styles.floating, shadow(2), i === 0 ? styles.floatLeft : styles.floatRight]}>
                  <View style={[styles.floatIcon, { backgroundColor: f.bg }]}>
                    <Ionicons name={f.icon} size={14} color={f.color} />
                  </View>
                  <Text style={styles.floatText}>{f.text}</Text>
                </View>
              ))}
            </View>
            <Text style={[styles.title, compact && { fontSize: 24 }]}>{t(`welcome.${item.key}Title`)}</Text>
            <Text style={[styles.text, compact && { fontSize: 14, lineHeight: 20, marginTop: space.sm }]}>
              {t(`welcome.${item.key}Text`)}
            </Text>
          </View>
        )}
      />

      <View style={styles.dots}>
        {slides.map((s, i) => (
          <View key={s.key} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>

      <View style={styles.actions}>
        <Button title={isLast ? t('welcome.getStarted') : t('common.continue')} iconRight="arrow-forward" onPress={next} />
        <View style={styles.loginRow}>
          <Pressable onPress={browse} hitSlop={8}>
            <Text style={styles.browse}>{t('welcome.browse')}</Text>
          </Pressable>
          <Text style={styles.sep}>·</Text>
          <Pressable
            hitSlop={8}
            onPress={async () => {
              await finishOnboarding();
              router.push('/auth/login');
            }}>
            <Text style={styles.login}>{t('welcome.haveAccount')}</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  brandLogo: { width: 30, height: 30 },
  brandName: { ...font.h3, color: colors.primaryDark },
  langToggle: { flexDirection: 'row', backgroundColor: colors.bg, borderRadius: radius.pill, padding: 3 },
  langOption: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.pill },
  langActive: { backgroundColor: colors.card, ...shadow(1) },
  langText: { ...font.smallStrong, color: colors.textMuted },
  langTextActive: { color: colors.primary },
  slide: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xxl },
  art: { alignItems: 'center', justifyContent: 'center', marginBottom: space.xl },
  circle: { borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  floating: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: radius.lg,
  },
  floatLeft: { top: 14, left: -12 },
  floatRight: { bottom: 18, right: -12 },
  floatIcon: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  floatText: { ...font.smallStrong, color: colors.text },
  title: { ...font.hero, color: colors.text, textAlign: 'center' },
  text: { ...font.body, color: colors.textSecondary, textAlign: 'center', marginTop: space.md, lineHeight: 22, maxWidth: 340 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginVertical: space.lg },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { width: 24, backgroundColor: colors.primary },
  actions: { paddingHorizontal: space.xl, paddingBottom: space.md },
  loginRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.lg,
  },
  browse: { ...font.bodyStrong, color: colors.textSecondary },
  sep: { color: colors.textMuted },
  login: { ...font.bodyStrong, color: colors.primary },
});
