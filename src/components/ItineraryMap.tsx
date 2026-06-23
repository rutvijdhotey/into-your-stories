import { StyleSheet, View, Text } from 'react-native';
import MapView, { Marker, Callout, PROVIDER_DEFAULT } from 'react-native-maps';
import { Spacing, BorderRadius } from '../theme';
import { regionForPins, pinColor } from '../services/mapHelpers';
import { categoryLabel } from '../services/noteHelpers';
import type { LocatedStop } from '../services/blogHelpers';

export default function ItineraryMap({ stops }: { stops: LocatedStop[] }) {
  const region = regionForPins(stops);
  if (!region) return null;
  return (
    <View style={styles.wrap}>
      <MapView style={styles.map} provider={PROVIDER_DEFAULT} initialRegion={region}>
        {stops.map((s, i) => (
          <Marker
            key={`${s.place_name}-${i}`}
            coordinate={{ latitude: s.lat, longitude: s.lng }}
            pinColor={pinColor(s.category)}
          >
            <Callout>
              <View style={styles.callout}>
                <Text style={styles.calloutTitle}>{s.place_name}</Text>
                {s.category ? <Text style={styles.calloutMeta}>{categoryLabel(s.category)}</Text> : null}
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 200,
    borderRadius: BorderRadius.card,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  map: { flex: 1 },
  // Apple Maps renders callouts in a light bubble, so use dark text here.
  callout: { padding: Spacing.xs, maxWidth: 220 },
  calloutTitle: { fontSize: 14, fontWeight: '700', color: '#111111' },
  calloutMeta: { fontSize: 12, color: '#333333', marginTop: 2 },
});
