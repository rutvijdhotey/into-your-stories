import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import MapView, { Marker, Callout, PROVIDER_DEFAULT } from 'react-native-maps';
import { useNotes } from '../../hooks/useNotes';
import CategoryPicker from '../../components/CategoryPicker';
import NoteEditSheet from '../../components/NoteEditSheet';
import { categoryLabel, type Category, type Note } from '../../services/noteHelpers';
import {
  toPins,
  filterPins,
  regionForPins,
  countWithoutLocation,
  pinColor,
} from '../../services/mapHelpers';
import { CategoryColors, Colors, Spacing, Typography } from '../../theme';

type Props = { tripId: string };

export default function TripMapScreen({ tripId }: Props) {
  const { items, loading, error, refresh } = useNotes(tripId);
  const [filter, setFilter] = useState<Category | null>(null);
  const [editingNote, setEditingNote] = useState<Note | null>(null);

  const pins = useMemo(() => toPins(items), [items]);
  const filtered = useMemo(() => filterPins(pins, filter), [pins, filter]);
  const region = useMemo(() => regionForPins(filtered), [filtered]);
  const noLocationCount = useMemo(() => countWithoutLocation(items), [items]);

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
        <Text style={styles.error}>Could not load notes: {error.message}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CategoryPicker value={filter} onChange={setFilter} />

      <View style={styles.mapWrap}>
        {region ? (
          <MapView
            style={StyleSheet.absoluteFill}
            provider={PROVIDER_DEFAULT}
            userInterfaceStyle="dark"
            region={region}
          >
            {filtered.map((p) => {
              const colors = CategoryColors[p.category ?? 'general'] ?? CategoryColors.general;
              const title = p.place_name ?? (categoryLabel(p.category) || 'Note');
              return (
                <Marker
                  key={p.id}
                  coordinate={{ latitude: p.lat, longitude: p.lng }}
                  pinColor={pinColor(p.category)}
                >
                  <Callout onPress={() => setEditingNote(p.note)}>
                    <View style={styles.callout}>
                      <Text style={styles.calloutTitle}>{title}</Text>
                      {p.category && (
                        <View style={[styles.badge, { backgroundColor: colors.bg }]}>
                          <Text style={[styles.badgeLabel, { color: colors.text }]}>
                            {p.category}
                          </Text>
                        </View>
                      )}
                      {p.content.length > 0 && (
                        <Text style={styles.calloutSnippet} numberOfLines={2}>
                          {p.content.slice(0, 80)}
                        </Text>
                      )}
                    </View>
                  </Callout>
                </Marker>
              );
            })}
          </MapView>
        ) : (
          <View style={[styles.center, styles.emptyPad]}>
            <Text style={styles.emptyBody}>
              {pins.length > 0 && filter
                ? `No ${categoryLabel(filter)} places on the map.`
                : 'Places appear here as you capture notes with locations.'}
            </Text>
          </View>
        )}

        {noLocationCount > 0 && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>
              {noLocationCount} {noLocationCount === 1 ? 'note' : 'notes'} without a location
            </Text>
          </View>
        )}
      </View>

      {editingNote && (
        <NoteEditSheet
          note={editingNote}
          visible={true}
          onClose={() => setEditingNote(null)}
          onDeleted={() => setEditingNote(null)}
          onMoved={() => {
            setEditingNote(null);
            refresh();
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  mapWrap: { flex: 1, position: 'relative' },
  error: { ...Typography.body, color: Colors.error, textAlign: 'center' },
  emptyBody: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center' },
  // Clears the absolute no-location banner so the empty-state text never sits under it.
  emptyPad: { paddingBottom: 64 },
  banner: {
    position: 'absolute',
    bottom: Spacing.md,
    left: Spacing.md,
    right: Spacing.md,
    backgroundColor: 'rgba(28,28,30,0.9)',
    borderRadius: 999,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
  },
  bannerText: { ...Typography.caption, color: Colors.textSecondary },
  // Callout renders in a native (light) bubble, so use dark text here.
  callout: { maxWidth: 220, padding: Spacing.xs, gap: 4 },
  calloutTitle: { fontSize: 15, fontWeight: '700', color: '#111111' },
  calloutSnippet: { fontSize: 13, color: '#333333' },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999 },
  badgeLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.3, textTransform: 'uppercase' },
});
