import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { MainStackParamList } from './types';
import { Colors } from '../theme';
import TabNavigator from './TabNavigator';
import TripDetailScreen from '../screens/trip/TripDetailScreen';

const Stack = createNativeStackNavigator<MainStackParamList>();

export default function MainStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: Colors.background },
        headerTitleStyle: { color: Colors.textPrimary },
        headerTintColor: Colors.accent,
        contentStyle: { backgroundColor: Colors.background },
      }}
    >
      <Stack.Screen name="Tabs" component={TabNavigator} options={{ headerShown: false }} />
      <Stack.Screen
        name="TripDetail"
        component={TripDetailScreen}
        options={{ title: '', headerBackTitle: 'Home' }}
      />
    </Stack.Navigator>
  );
}
