import { useCallback, useEffect, useState } from 'react';
import { View, AppState, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainStackParamList } from './types';
import { Colors } from '../theme';
import TabNavigator from './TabNavigator';
import TripDetailScreen from '../screens/trip/TripDetailScreen';
import FloatingCaptureButton from '../components/FloatingCaptureButton';
import NoteCaptureSheet from '../components/NoteCaptureSheet';
import { useOnReconnect } from '../hooks/useConnectivity';
import { drainQueue } from '../services/noteService';

const Stack = createNativeStackNavigator<MainStackParamList>();

function MainStackInner() {
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureAutoRecord, setCaptureAutoRecord] = useState(false);
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();

  useEffect(() => {
    void drainQueue();
  }, []);

  useOnReconnect(
    useCallback(() => {
      void drainQueue();
    }, []),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void drainQueue();
    });
    return () => sub.remove();
  }, []);

  const handleSearchIntent = useCallback(
    (_query: string) => {
      // Navigate to the Search tab — query pre-fill wired in Phase 7
      navigation.navigate('Tabs', { screen: 'Search' });
    },
    [navigation],
  );

  return (
    <View style={styles.root}>
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
      <FloatingCaptureButton
        onPress={() => { setCaptureAutoRecord(false); setCaptureOpen(true); }}
        onLongPress={() => { setCaptureAutoRecord(true); setCaptureOpen(true); }}
      />
      <NoteCaptureSheet
        visible={captureOpen}
        autoRecord={captureAutoRecord}
        onClose={() => { setCaptureOpen(false); setCaptureAutoRecord(false); }}
        onStartTrip={() => { setCaptureOpen(false); setCaptureAutoRecord(false); }}
        onSearchIntent={handleSearchIntent}
      />
    </View>
  );
}

export default function MainStack() {
  return <MainStackInner />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
