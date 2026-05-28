import { ScrollView, View, Image, Text, StyleSheet } from 'react-native';

type Props = {
  urls: string[];
};

export default function PhotoStrip({ urls }: Props) {
  if (urls.length === 0) return null;

  const overflow = urls.length > 3 ? urls.length - 2 : 0;
  const visibleUrls = overflow > 0 ? urls.slice(0, 2) : urls;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      {visibleUrls.map((url) => (
        <Image key={url} source={{ uri: url }} style={styles.thumb} resizeMode="cover" />
      ))}
      {overflow > 0 && (
        <View style={styles.overflowContainer}>
          <Image source={{ uri: urls[2] }} style={styles.thumb} resizeMode="cover" />
          <View style={styles.overlay}>
            <Text style={styles.overflowLabel}>+{overflow}</Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 8 },
  content: { gap: 6, paddingBottom: 4 },
  thumb: { width: 72, height: 72, borderRadius: 8 },
  overflowContainer: { position: 'relative', width: 72, height: 72 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overflowLabel: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
