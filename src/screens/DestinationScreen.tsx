import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, ScrollView, Pressable,
} from 'react-native';
import MapView, { Marker, Callout, PROVIDER_DEFAULT, type MapMarker } from 'react-native-maps';
import { useRoute, type RouteProp } from '@react-navigation/native';
import type { MainStackParamList } from '../navigation/types';
import { listPlacesByCity } from '../services/publicPlacesService';
import {
  rankPlaces, categoriesPresent, avgRating, type PublicPlace,
} from '../services/publicPlaceHelpers';
import { regionForPins, pinColor } from '../services/mapHelpers';
import { categoryLabel, type Category } from '../services/noteHelpers';
import PublicPlaceRow from '../components/PublicPlaceRow';
import { Colors, Spacing, Typography, CategoryColors, BorderRadius } from '../theme';

type DestinationRoute = RouteProp<MainStackParamList, 'Destination'>;

function hasCoords(p: PublicPlace): p is PublicPlace & { lat: number; lng: number } {
  return p.lat != null && p.lng != null;
}

export default function DestinationScreen() {
  const { params } = useRoute<DestinationRoute>();
  const city = params.city;

  const [places, setPlaces] = useState<PublicPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [filter, setFilter] = useState<Category | null>(null);

  const mapRef = useRef<MapView>(null);
  const markerRefs = useRef<Record<string, MapMarker | null>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listPlacesByCity(city)
      .then((rows) => { if (!cancelled) { setPlaces(rows); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e as Error); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [city]);

  const chips = useMemo(() => categoriesPresent(places), [places]);
  const visible = useMemo(
    () => (filter ? places.filter((p) => p.dominant_category === filter) : places),
    [places, filter],
  );
  const ranked = useMemo(() => rankPlaces(visible), [visible]);
  const pins = useMemo(() => visible.filter(hasCoords), [visible]);
  const region = useMemo(
    () => regionForPins(pins.map((p) => ({ lat: p.lat, lng: p.lng }))),
    [pins],
  );

  function focusPlace(p: PublicPlace) {
    if (!hasCoords(p)) return;
    mapRef.current?.animateToRegion(
      { latitude: p.lat, longitude: p.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 },
      350,
    );
    markerRefs.current[p.id]?.showCallout();
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Could not load places: {error.message}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{city}</Text>

      {region && (
        <View style={styles.mapWrap}>
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            provider={PROVIDER_DEFAULT}
            userInterfaceStyle="dark"
            region={region}
          >
            {pins.map((p) => (
              <Marker
                key={p.id}
                ref={(m) => { markerRefs.current[p.id] = m; }}
                coordinate={{ latitude: p.lat, longitude: p.lng }}
                pinColor={pinColor(p.dominant_category)}
              >
                <Callout>
                  <View style={styles.callout}>
                    <Text style={styles.calloutTitle}>{p.place_name}</Text>
                    <Text style={styles.calloutMeta}>
                      {p.visit_count} {p.visit_count === 1 ? 'visit' : 'visits'}
                      {avgRating(p.rating_sum, p.rating_count) != null
                        ? ` · ★ ${avgRating(p.rating_sum, p.rating_count)!.toFixed(1)}`
                        : ''}
                    </Text>
                  </View>
                </Callout>
              </Marker>
            ))}
          </MapView>
        </View>
      )}

      {chips.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipRow}
          contentContainerStyle={styles.chipContent}
        >
          <FilterChip label="All" active={filter === null} onPress={() => setFilter(null)} />
          {chips.map((c) => (
            <FilterChip
              key={c}
              label={categoryLabel(c)}
              active={filter === c}
              color={(CategoryColors[c] ?? CategoryColors.general).text}
              onPress={() => setFilter(c)}
            />
          ))}
        </ScrollView>
      )}

      <ScrollView style={styles.list}>
        {ranked.map((p) => (
          <PublicPlaceRow key={p.id} place={p} onPress={() => focusPlace(p)} />
        ))}
        {ranked.length === 0 && (
          <Text style={styles.empty}>No places to show.</Text>
        )}
      </ScrollView>
    </View>
  );
}

function FilterChip(props: { label: string; active: boolean; color?: string; onPress: () => void }) {
  const { label, active, color, onPress } = props;
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && { backgroundColor: color ?? Colors.accent, borderColor: color ?? Colors.accent }]}
    >
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  error: { ...Typography.body, color: Colors.error, textAlign: 'center' },
  title: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary, padding: Spacing.md },
  mapWrap: { height: 240, marginHorizontal: Spacing.md, borderRadius: BorderRadius.card, overflow: 'hidden' },
  chipRow: { flexGrow: 0, marginTop: Spacing.sm },
  chipContent: { paddingHorizontal: Spacing.md, gap: Spacing.sm, alignItems: 'center' },
  chip: {
    paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: BorderRadius.pill,
    borderWidth: 1, borderColor: Colors.border,
  },
  chipLabel: { ...Typography.caption, color: Colors.textSecondary },
  chipLabelActive: { color: '#111111', fontWeight: '700' },
  list: { flex: 1, marginTop: Spacing.sm },
  empty: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center', padding: Spacing.lg },
  callout: { maxWidth: 220, padding: Spacing.xs, gap: 4 },
  calloutTitle: { fontSize: 15, fontWeight: '700', color: '#111111' },
  calloutMeta: { fontSize: 13, color: '#333333' },
});
