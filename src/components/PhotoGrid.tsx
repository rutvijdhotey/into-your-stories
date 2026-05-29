import { View, Image, StyleSheet, useWindowDimensions } from 'react-native';

type Props = {
  photoUrls: string[];
};

export default function PhotoGrid({ photoUrls }: Props) {
  const { width: screenWidth } = useWindowDimensions();

  if (photoUrls.length === 0) return null;

  // 16px margin on each side = 32px total; 2px gap × 2 = 4px between 3 cells
  const cellSize = Math.floor((screenWidth - 32 - 4) / 3);

  return (
    <View style={styles.grid}>
      {photoUrls.map((url, i) => (
        <Image
          key={`${url}-${i}`}
          source={{ uri: url }}
          style={[styles.cell, { width: cellSize, height: cellSize }]}
          resizeMode="cover"
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 2,
    marginBottom: 12,
  },
  cell: { borderRadius: 0 },
});
