// After the native splash (static logo) we play a short brand animation, then fade into the app.
import { useEffect, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { colors, gradients } from '../lib/theme';

export function BootSplash({ ready }: { ready: boolean }) {
  const [done, setDone] = useState(false);
  const scale = useRef(new Animated.Value(0.85)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 6, useNativeDriver: true }),
      Animated.timing(logoOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.timing(textOpacity, { toValue: 1, duration: 500, delay: 250, useNativeDriver: true }),
    ]).start();
  }, [scale, logoOpacity, textOpacity]);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      Animated.timing(fade, { toValue: 0, duration: 350, useNativeDriver: true }).start(() => setDone(true));
    }, 700);
    return () => clearTimeout(timer);
  }, [ready, fade]);

  if (done) return null;
  return (
    <Animated.View pointerEvents={ready ? 'none' : 'auto'} style={[StyleSheet.absoluteFill, { opacity: fade, zIndex: 100 }]}>
      <LinearGradient colors={gradients.hero} style={styles.fill}>
        <Animated.View style={{ opacity: logoOpacity, transform: [{ scale }] }}>
          <Image source={require('../assets/logo-white.png')} style={styles.logo} />
        </Animated.View>
        <Animated.View style={{ opacity: textOpacity, alignItems: 'center' }}>
          <Text style={styles.name}>GharKhoji</Text>
          <Text style={styles.tag}>घरखोजी · Find your home</Text>
        </Animated.View>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 132, height: 132 },
  name: { color: '#fff', fontSize: 34, fontWeight: '800', letterSpacing: -0.5, marginTop: 8 },
  tag: { color: colors.primaryTint, fontSize: 15, marginTop: 6, fontWeight: '500' },
});
