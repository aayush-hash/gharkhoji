// Custom bottom navigation: floating white bar, filled icons when active,
// badge for listings that need confirmation, and a raised "+" for owners.
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, gradients, radius, shadow } from '../lib/theme';
import { tap } from './ui';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];
type IconPair = [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap];

const ICONS: Record<string, IconPair> = {
  index: ['compass', 'compass-outline'],
  map: ['map', 'map-outline'],
  saved: ['heart', 'heart-outline'],
  chats: ['chatbubbles', 'chatbubbles-outline'],
  mine: ['albums', 'albums-outline'],
  profile: ['person-circle', 'person-circle-outline'],
};

export function TabBar({
  state,
  descriptors,
  navigation,
  visible,
  showPost,
  badges,
}: TabBarProps & { visible: string[]; showPost: boolean; badges: Record<string, number> }) {
  const insets = useSafeAreaInsets();
  const routes = state.routes.filter((r) => visible.includes(r.name));
  // Put the + button in the middle
  const middle = Math.floor(routes.length / 2);

  const renderTab = (route: (typeof routes)[number]) => {
    const focused = state.routes[state.index]?.key === route.key;
    const { options } = descriptors[route.key];
    const label = typeof options.title === 'string' ? options.title : route.name;
    const [on, off] = ICONS[route.name] ?? ['ellipse', 'ellipse-outline'];
    const badge = badges[route.name] ?? 0;
    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={label}
        onPress={() => {
          tap();
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        }}
        style={styles.tab}>
        <View>
          <Ionicons name={focused ? on : off} size={24} color={focused ? colors.primary : colors.textMuted} />
          {badge > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.label, focused && styles.labelActive]} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.bar, shadow(3), { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {routes.slice(0, middle).map(renderTab)}
      {showPost ? (
        <View style={styles.postSlot}>
          <Pressable
            accessibilityLabel="Post a room"
            onPress={() => {
              tap();
              router.push('/post');
            }}
            style={({ pressed }) => [styles.postButton, shadow(2), pressed && { transform: [{ scale: 0.95 }] }]}>
            <LinearGradient colors={gradients.brand} style={styles.postGradient}>
              <Ionicons name="add" size={30} color="#fff" />
            </LinearGradient>
          </Pressable>
        </View>
      ) : null}
      {routes.slice(middle).map(renderTab)}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    paddingTop: 10,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
  },
  tab: { flex: 1, alignItems: 'center', gap: 3 },
  label: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  labelActive: { color: colors.primary },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: colors.card,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  postSlot: { flex: 1, alignItems: 'center' },
  postButton: { marginTop: -28, width: 58, height: 58, borderRadius: 29, borderWidth: 4, borderColor: colors.card },
  postGradient: { flex: 1, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
});
