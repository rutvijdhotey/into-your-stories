import { isLocalUri, toStoragePath, replacePhotoRefsInMarkdown } from '../photoRefs';

const LEGACY_PUBLIC =
  'https://abcdefgh.supabase.co/storage/v1/object/public/photos/user-1/note-1/0.jpg';
const LEGACY_SIGNED =
  'https://abcdefgh.supabase.co/storage/v1/object/sign/photos/user-1/note-1/0.jpg?token=ey.123';

describe('isLocalUri', () => {
  it('recognises on-device URIs', () => {
    expect(isLocalUri('file:///var/mobile/photo.jpg')).toBe(true);
    expect(isLocalUri('ph://ABC-123')).toBe(true);
    expect(isLocalUri('assets-library://asset/asset.JPG')).toBe(true);
    expect(isLocalUri('content://media/external/images/1')).toBe(true);
    expect(isLocalUri('data:image/jpeg;base64,AAAA')).toBe(true);
  });

  it('does not treat storage paths or https URLs as local', () => {
    expect(isLocalUri('user-1/note-1/0.jpg')).toBe(false);
    expect(isLocalUri(LEGACY_PUBLIC)).toBe(false);
  });
});

describe('toStoragePath', () => {
  it('passes a bare storage path through', () => {
    expect(toStoragePath('user-1/note-1/0.jpg')).toBe('user-1/note-1/0.jpg');
  });

  it('strips the cover-photo cache-buster query', () => {
    expect(toStoragePath('user-1/trip-covers/trip-9.jpg?v=1717171717')).toBe(
      'user-1/trip-covers/trip-9.jpg',
    );
  });

  it('extracts the path from a legacy public URL', () => {
    expect(toStoragePath(LEGACY_PUBLIC)).toBe('user-1/note-1/0.jpg');
  });

  it('extracts the path from a legacy signed URL', () => {
    expect(toStoragePath(LEGACY_SIGNED)).toBe('user-1/note-1/0.jpg');
  });

  it('decodes percent-escapes in a legacy URL path', () => {
    expect(
      toStoragePath(
        'https://abcdefgh.supabase.co/storage/v1/object/public/photos/user-1/trip-covers/a%20b.jpg',
      ),
    ).toBe('user-1/trip-covers/a b.jpg');
  });

  it('returns null for local URIs', () => {
    expect(toStoragePath('file:///var/mobile/photo.jpg')).toBeNull();
    expect(toStoragePath('ph://ABC-123')).toBeNull();
  });

  it('returns null for a URL that is not a photos-bucket object', () => {
    expect(toStoragePath('https://example.com/cat.jpg')).toBeNull();
    expect(
      toStoragePath('https://abcdefgh.supabase.co/storage/v1/object/public/avatars/a.jpg'),
    ).toBeNull();
  });

  it('returns null for empty or whitespace input', () => {
    expect(toStoragePath('')).toBeNull();
    expect(toStoragePath('   ')).toBeNull();
  });

  it('trims surrounding whitespace and leading slashes', () => {
    expect(toStoragePath('  /user-1/note-1/0.jpg  ')).toBe('user-1/note-1/0.jpg');
  });
});

describe('replacePhotoRefsInMarkdown', () => {
  it('rewrites image sources through the resolver', () => {
    const md = 'Intro\n\n![a view](user-1/note-1/0.jpg)\n\nMore text.';
    const out = replacePhotoRefsInMarkdown(md, (ref) =>
      ref === 'user-1/note-1/0.jpg' ? 'https://signed/0.jpg' : null,
    );
    expect(out).toBe('Intro\n\n![a view](https://signed/0.jpg)\n\nMore text.');
  });

  it('leaves an image untouched when the resolver returns null', () => {
    const md = '![x](https://example.com/cat.jpg)';
    expect(replacePhotoRefsInMarkdown(md, () => null)).toBe(md);
  });

  it('rewrites every image in the document', () => {
    const md = '![a](p/0.jpg)\ntext\n![b](p/1.jpg)';
    const out = replacePhotoRefsInMarkdown(md, (ref) => `https://signed/${ref}`);
    expect(out).toBe('![a](https://signed/p/0.jpg)\ntext\n![b](https://signed/p/1.jpg)');
  });

  it('does not touch ordinary links', () => {
    const md = '[a link](p/0.jpg)';
    expect(replacePhotoRefsInMarkdown(md, () => 'https://signed/0.jpg')).toBe(md);
  });

  it('collects the refs it finds', () => {
    const md = '![a](p/0.jpg) ![b](p/1.jpg) ![c](p/0.jpg)';
    const seen: string[] = [];
    replacePhotoRefsInMarkdown(md, (ref) => {
      seen.push(ref);
      return null;
    });
    expect(seen).toEqual(['p/0.jpg', 'p/1.jpg', 'p/0.jpg']);
  });

  it('handles an empty document', () => {
    expect(replacePhotoRefsInMarkdown('', () => 'x')).toBe('');
  });
});
