import { useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import PagerView from 'react-native-pager-view';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../theme';
import HomeScreen from '../screens/HomeScreen';
import ExploreScreen from '../screens/ExploreScreen';
import SearchScreen from '../screens/SearchScreen';
import BlogScreen from '../screens/BlogScreen';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

type TabEntry = {
  name: string;
  icons: { active: IoniconsName; inactive: IoniconsName };
  component: React.ComponentType;
};

export const TAB_CONFIG: TabEntry[] = [
  { name: 'Home',    icons: { active: 'home',          inactive: 'home-outline'          }, component: HomeScreen },
  { name: 'Explore', icons: { active: 'compass',       inactive: 'compass-outline'       }, component: ExploreScreen },
  { name: 'Search',  icons: { active: 'search',        inactive: 'search-outline'        }, component: SearchScreen },
  { name: 'Blog',    icons: { active: 'document-text', inactive: 'document-text-outline' }, component: BlogScreen },
];

export default function TabNavigator() {
  const insets = useSafeAreaInsets();
  const pagerRef = useRef<PagerView>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <View style={styles.root}>
      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={0}
        onPageSelected={(e) => setActiveIndex(e.nativeEvent.position)}
      >
        {TAB_CONFIG.map((tab) => (
          <View key={tab.name} style={styles.page}>
            <tab.component />
          </View>
        ))}
      </PagerView>

      <View style={[styles.tabBar, { paddingBottom: insets.bottom }]}>
        {TAB_CONFIG.map((tab, index) => {
          const focused = index === activeIndex;
          const color = focused ? Colors.accent : '#555555';
          return (
            <Pressable
              key={tab.name}
              style={styles.tabItem}
              onPress={() => pagerRef.current?.setPage(index)}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
            >
              <Ionicons
                name={focused ? tab.icons.active : tab.icons.inactive}
                size={24}
                color={color}
              />
              <Text style={[styles.tabLabel, { color }]}>{tab.name}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pager: { flex: 1 },
  page: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(17,17,17,0.97)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
    paddingBottom: 4,
    gap: 2,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
});
