jest.mock('react-native-pager-view', () => ({
  __esModule: true,
  default: 'PagerView',
}));
jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));
jest.mock('../../screens/HomeScreen', () => ({ __esModule: true, default: () => null }));
jest.mock('../../screens/ExploreScreen', () => ({ __esModule: true, default: () => null }));
jest.mock('../../screens/SearchScreen', () => ({ __esModule: true, default: () => null }));
jest.mock('../../screens/BlogScreen', () => ({ __esModule: true, default: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, top: 0, left: 0, right: 0 }),
}));

import { TAB_CONFIG } from '../TabNavigator';

describe('TabPager configuration', () => {
  it('has four tabs in the correct order per spec', () => {
    expect(TAB_CONFIG.map((t) => t.name)).toEqual(['Home', 'Explore', 'Search', 'Blog']);
  });

  it('each tab has distinct active and inactive icon names', () => {
    for (const tab of TAB_CONFIG) {
      expect(typeof tab.icons.active).toBe('string');
      expect(typeof tab.icons.inactive).toBe('string');
      expect(tab.icons.active).not.toBe(tab.icons.inactive);
    }
  });
});
