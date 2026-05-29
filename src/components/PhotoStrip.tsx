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
              <Image source={{ uri: url }} style={styles.thumb} resizeMode="cover" />
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
