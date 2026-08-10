import { useState } from 'react';
import {
  ScrollView,
  View,
  Image,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  FlatList,
  useWindowDimensions,
  SafeAreaView,
} from 'react-native';
import { useSignedPhotoUrls } from '../hooks/useSignedPhotos';

const MAX_VISIBLE = 3;

type Props = {
  /** Stored photo references (storage paths, or legacy URLs) — signed here for display. */
  refs: string[];
};

export default function PhotoStrip({ refs }: Props) {
  const [galleryOpen, setGalleryOpen] = useState(false);
  const urls = useSignedPhotoUrls(refs);

  if (refs.length === 0) return null;

  const visibleRefs = refs.slice(0, MAX_VISIBLE);
  const hasMore = refs.length > MAX_VISIBLE;
  // Number shown on the 4th tile: remaining photos including the one hidden behind the overlay
  const overflowCount = refs.length - (MAX_VISIBLE - 1);

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.strip}
        contentContainerStyle={styles.stripContent}
      >
        {visibleRefs.map((ref, index) => {
          const isOverflowTile = hasMore && index === MAX_VISIBLE - 1;
          const uri = urls[ref];
          return (
            <Pressable
              key={ref}
              onPress={isOverflowTile ? () => setGalleryOpen(true) : undefined}
              style={styles.thumbContainer}
            >
              {/* The tile keeps its slot while the URL is still being signed, so
                  the strip doesn't reflow as photos resolve. */}
              <View style={styles.thumb}>
                {uri ? (
                  <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
                ) : null}
              </View>
              {isOverflowTile && (
                <View style={styles.overlay}>
                  <Text style={styles.overflowLabel}>+{overflowCount}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      <PhotoGallery
        refs={refs}
        urls={urls}
        visible={galleryOpen}
        onClose={() => setGalleryOpen(false)}
      />
    </>
  );
}

function PhotoGallery({
  refs,
  urls,
  visible,
  onClose,
}: {
  refs: string[];
  urls: Record<string, string>;
  visible: boolean;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      animationType="fade"
      statusBarTranslucent
    >
      <SafeAreaView style={styles.galleryBackground}>
        <Pressable
          onPress={onClose}
          style={styles.closeButton}
          accessibilityRole="button"
          accessibilityLabel="Close gallery"
          hitSlop={12}
        >
          <Text style={styles.closeLabel}>✕</Text>
        </Pressable>

        <FlatList
          data={refs}
          keyExtractor={(ref) => ref}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          getItemLayout={(_, index) => ({
            length: width,
            offset: width * index,
            index,
          })}
          renderItem={({ item }) => (
            <View style={[styles.galleryPage, { width, height }]}>
              {urls[item] ? (
                <Image
                  source={{ uri: urls[item] }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="contain"
                />
              ) : null}
            </View>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  strip: { marginTop: 8 },
  stripContent: { gap: 6, paddingBottom: 4 },
  thumbContainer: { width: 72, height: 72 },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.07)',
    overflow: 'hidden',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.60)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overflowLabel: { color: '#fff', fontWeight: '700', fontSize: 16 },

  // Gallery
  galleryBackground: { flex: 1, backgroundColor: '#000' },
  closeButton: {
    alignSelf: 'flex-end',
    margin: 16,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeLabel: { color: '#fff', fontSize: 20, fontWeight: '600' },
  galleryPage: { alignItems: 'center', justifyContent: 'center' },
});
