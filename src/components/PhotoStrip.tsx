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

const MAX_VISIBLE = 3;
// 72pt × 3 screen-scale → 216px; use 200px for a clean number
const THUMB_PX = 200;

/**
 * Converts a Supabase Storage public URL to the image-render endpoint so the
 * server returns a pre-scaled JPEG instead of the full-res original.
 * Falls back to the original URL for anything that isn't a Supabase /object/ URL
 * (e.g. local file:// URIs on pending cards, or non-Supabase hosts).
 */
function toThumbnailUrl(url: string, px: number): string {
  const rendered = url.replace(
    '/storage/v1/object/public/',
    '/storage/v1/render/image/public/',
  );
  if (rendered === url) return url; // not a Supabase object URL — leave as-is
  const base = rendered.split('?')[0]; // strip any existing ?v= or other params
  return `${base}?width=${px}&height=${px}&resize=cover&quality=75`;
}

type Props = {
  urls: string[];
};

export default function PhotoStrip({ urls }: Props) {
  const [galleryOpen, setGalleryOpen] = useState(false);

  if (urls.length === 0) return null;

  const visibleUrls = urls.slice(0, MAX_VISIBLE);
  const hasMore = urls.length > MAX_VISIBLE;
  // Number shown on the 4th tile: remaining photos including the one hidden behind the overlay
  const overflowCount = urls.length - (MAX_VISIBLE - 1);

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.strip}
        contentContainerStyle={styles.stripContent}
      >
        {visibleUrls.map((url, index) => {
          const isOverflowTile = hasMore && index === MAX_VISIBLE - 1;
          return (
            <Pressable
              key={url}
              onPress={isOverflowTile ? () => setGalleryOpen(true) : undefined}
              style={styles.thumbContainer}
            >
              <Image source={{ uri: toThumbnailUrl(url, THUMB_PX) }} style={styles.thumb} resizeMode="cover" />
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
        urls={urls}
        visible={galleryOpen}
        onClose={() => setGalleryOpen(false)}
      />
    </>
  );
}

function PhotoGallery({
  urls,
  visible,
  onClose,
}: {
  urls: string[];
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
          data={urls}
          keyExtractor={(url) => url}
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
              <Image
                source={{ uri: item }}
                style={StyleSheet.absoluteFill}
                resizeMode="contain"
              />
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
  thumb: { width: 72, height: 72, borderRadius: 8 },
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
