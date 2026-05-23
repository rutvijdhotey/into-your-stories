import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { TabParamList } from './types';
import { Colors } from '../theme';
import HomeScreen from '../screens/HomeScreen';
import ExploreScreen from '../screens/ExploreScreen';
import SearchScreen from '../screens/SearchScreen';
import BlogScreen from '../screens/BlogScreen';

const Tab = createBottomTabNavigator<TabParamList>();

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ICONS: Record<keyof TabParamList, { active: IoniconsName; inactive: IoniconsName }> = {
  Home:    { active: 'home',          inactive: 'home-outline' },
  Explore: { active: 'compass',       inactive: 'compass-outline' },
  Search:  { active: 'search',        inactive: 'search-outline' },
  Blog:    { active: 'document-text', inactive: 'document-text-outline' },
};

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, size }) => {
          const icons = TAB_ICONS[route.name as keyof TabParamList];
          const name = focused ? icons.active : icons.inactive;
          const color = focused ? Colors.accent : '#555555';
          return <Ionicons name={name} size={size} color={color} />;
        },
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: '#555555',
        tabBarStyle: {
          backgroundColor: 'rgba(17,17,17,0.97)',
          borderTopColor: 'rgba(255,255,255,0.08)',
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Explore" component={ExploreScreen} />
      <Tab.Screen name="Search" component={SearchScreen} />
      <Tab.Screen name="Blog" component={BlogScreen} />
    </Tab.Navigator>
  );
}
