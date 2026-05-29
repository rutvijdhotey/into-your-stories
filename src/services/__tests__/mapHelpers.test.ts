import { pinColor } from '../mapHelpers';
import { CategoryColors } from '../../theme';

describe('pinColor', () => {
  it('returns the vivid text color for a known category', () => {
    expect(pinColor('food')).toBe(CategoryColors.food.text);
    expect(pinColor('to-visit')).toBe(CategoryColors['to-visit'].text);
  });

  it('falls back to the general color for null', () => {
    expect(pinColor(null)).toBe(CategoryColors.general.text);
  });
});
