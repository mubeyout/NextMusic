import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Icon, type IconName } from '../theme/Icon';
import { C } from '../theme/tokens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { settings, useSettings } from '../services/settings';

// Figma Navigation/Bottom: 3 items (首页/探索/我的), icon 24 + label 11, active=brand green
export function TabBar({ state, navigation }: {
  state: { index: number; routes: { name: string; key: string }[] };
  navigation: { emit: (e: { type: string; target: string }) => { defaultPrevented: boolean }; navigate: (n: string) => void };
}) {
  const insets = useSafeAreaInsets();
  const s = useSettings(); // 订阅：底栏标签开关即时生效
  const items: { name: string; icon: IconName; label: string }[] = [
    { name: 'Home', icon: 'home', label: '首页' },
    { name: 'Explore', icon: 'explore', label: '探索' },
    { name: 'My', icon: 'my', label: '我的' },
  ];
  return (
    <View style={[st.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {items.map((it, i) => {
        const on = state.index === i;
        return (
          <TouchableOpacity
            key={it.name}
            style={st.item}
            accessibilityRole="button"
            onPress={() => {
              const ev = navigation.emit({ type: 'tabPress', target: state.routes[i].key });
              if (!isTabState(navigation) || !ev.defaultPrevented) {
                navigation.navigate(it.name);
              }
            }}
          >
            <Icon name={it.icon} size={24} active={on} />
            {s.showTabLabels ? <Text style={[st.label, on && st.labelOn]}>{it.label}</Text> : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// minimal structural guard; react-navigation passes full object at runtime
function isTabState(n: unknown): boolean {
  return !!n;
}

const st = StyleSheet.create({
  bar: {
    flexDirection: 'row', backgroundColor: '#171717',
    paddingTop: 8, paddingHorizontal: 24,
  },
  item: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 4 },
  label: { color: C.text2, fontSize: 11, lineHeight: 13, fontWeight: '400' },
  labelOn: { color: C.brand, fontWeight: '500' },
});
