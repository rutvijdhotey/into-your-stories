import { render } from '@testing-library/react-native';
import { Image, Text } from 'react-native';

// Signing itself is covered by signedPhotoUrls.test.ts. Here the resolved map is
// controlled directly so the strip can be observed mid-resolution.
let mockUrls: Record<string, string> = {};
jest.mock('../../hooks/useSignedPhotos', () => ({
  useSignedPhotoUrls: () => mockUrls,
  useSignedPhotoUrl: (ref: string | null | undefined) => (ref ? (mockUrls[ref] ?? null) : null),
}));

import PhotoStrip from '../PhotoStrip';

const signed = (refs: string[]) => Object.fromEntries(refs.map((r) => [r, `https://signed/${r}`]));

beforeEach(() => {
  mockUrls = {};
});

describe('PhotoStrip', () => {
  it('renders nothing when there are no photos', () => {
    const { toJSON } = render(<PhotoStrip refs={[]} />);
    expect(toJSON()).toBeNull();
  });

  it('renders each visible photo at its signed URL', () => {
    const refs = ['u/n/0.jpg', 'u/n/1.jpg'];
    mockUrls = signed(refs);

    const { UNSAFE_queryAllByType } = render(<PhotoStrip refs={refs} />);

    const uris = UNSAFE_queryAllByType(Image).map(
      (img) => (img.props.source as { uri?: string }).uri,
    );
    expect(uris).toEqual(['https://signed/u/n/0.jpg', 'https://signed/u/n/1.jpg']);
  });

  it('renders no Image for a reference that has not resolved yet', () => {
    const refs = ['u/n/0.jpg', 'u/n/1.jpg'];
    mockUrls = signed(['u/n/0.jpg']);

    const { UNSAFE_queryAllByType } = render(<PhotoStrip refs={refs} />);

    const uris = UNSAFE_queryAllByType(Image).map(
      (img) => (img.props.source as { uri?: string }).uri,
    );
    expect(uris).toEqual(['https://signed/u/n/0.jpg']);
  });

  it('does not crash when nothing has resolved', () => {
    const { UNSAFE_queryAllByType } = render(<PhotoStrip refs={['u/n/0.jpg']} />);
    expect(UNSAFE_queryAllByType(Image)).toHaveLength(0);
  });

  it('shows an overflow count based on the reference count, not on what resolved', () => {
    const refs = ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg'];
    mockUrls = signed(['a.jpg']);

    const { UNSAFE_queryAllByType } = render(<PhotoStrip refs={refs} />);

    // 5 photos, 3 tiles → the 3rd tile stands for itself plus the 2 hidden ones.
    const labels = UNSAFE_queryAllByType(Text).map((t) =>
      ([] as unknown[]).concat(t.props.children).join(''),
    );
    expect(labels).toContain('+3');
  });
});
