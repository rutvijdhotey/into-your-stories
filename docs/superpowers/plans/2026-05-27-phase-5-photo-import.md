# Phase 5: Photo Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the inert 📷 button in `NoteCaptureSheet` to the iOS photo library, upload selected photos to Supabase Storage, and display them as thumbnails in `NoteCard` and as a grid in `TripFeedScreen`.

**Architecture:** Photos are uploaded to a public Supabase Storage bucket (`photos/{userId}/{noteOfflineId}/{index}.jpg`) before the note is saved; the resulting public URLs are stored in a new `photo_urls text[]` column on the `notes` table. The offline_id is pre-generated in the capture sheet so the storage path and note row share the same key. EXIF GPS from the first selected photo overrides the live-captured location.

**Tech Stack:** expo-image-picker (new dependency), expo-location (existing, used for reverse geocoding), Supabase JS v2 storage API, React Native ScrollView/FlatList/Image, jest-expo + @testing-library/react-native for TDD.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/006_photos.sql` | Add `photo_urls text[]` column |
| Modify | `src/lib/database.types.ts` | Add `photo_urls` to notes Row/Insert/Update |
| Create | `src/services/photoHelpers.ts` | Pure: DMS→decimal, EXIF extraction, count validation |
| Create | `src/services/__tests__/photoHelpers.test.ts` | TDD for helpers |
| Create | `src/services/photoService.ts` | Upload photo URI → Storage URL; delete by URL |
| Create | `src/services/__tests__/photoService.test.ts` | TDD for service |
| Create | `src/hooks/usePhotoPicker.ts` | expo-image-picker wrapper: permissions, pick, remove, clear |
| Create | `src/hooks/__tests__/usePhotoPicker.test.ts` | TDD for hook |
| Create | `src/components/PhotoStrip.tsx` | Horizontal thumbnail row (72×72, "+N" overflow) for NoteCard |
| Create | `src/components/PhotoGrid.tsx` | 3-col grid for TripFeedScreen header |
| Modify | `src/services/noteService.ts` | `CreateNoteInput` gains `photo_urls?` + `offline_id?`; `trySync` includes `photo_urls` |
| Modify | `src/components/NoteCard.tsx` | `ServerNoteCard` renders `<PhotoStrip>` when `photo_urls.length > 0` |
| Modify | `src/screens/trip/TripFeedScreen.tsx` | Add `<PhotoGrid>` as `ListHeaderComponent` |
| Modify | `src/components/NoteCaptureSheet.tsx` | Wire picker, preview strip, EXIF override, offline guard, upload-on-save |

---

### Task 1: Install expo-image-picker, create migration, update database types

**Files:**
- Create: `supabase/migrations/006_photos.sql`
- Modify: `src/lib/database.types.ts`

- [ ] **Step 1: Install expo-image-picker**

Run:
```bash
npx expo install expo-image-picker
```
Expected: package added to `node_modules` and `package.json`, no errors.

- [ ] **Step 2: Create migration file**

Create `supabase/migrations/006_photos.sql`:
```sql
ALTER TABLE notes ADD COLUMN photo_urls text[] NOT NULL DEFAULT '{}';
```

- [ ] **Step 3: Create the `photos` bucket in Supabase Storage**

In the Supabase dashboard → Storage → New bucket:
- Name: `photos`
- Public bucket: **ON** (enables permanent public URLs — no signed URL expiry to manage)
- Click Save.

(This must exist before any upload calls will work.)

- [ ] **Step 4: Apply the migration to your Supabase project**

Run in Supabase dashboard SQL editor or via CLI:
```bash
npx supabase db push
```
(or apply the SQL manually in the Supabase dashboard → SQL Editor)

- [ ] **Step 5: Update `database.types.ts` to add `photo_urls` to notes**

In `src/lib/database.types.ts`, find the `notes` table definition and add `photo_urls` to all three sections:

```typescript
// In Row:
photo_urls: string[]

// In Insert:
photo_urls?: string[]

// In Update:
photo_urls?: string[]
```

Full notes Row (replace existing):
```typescript
notes: {
  Row: {
    captured_at: string
    category: string | null
    city: string | null
    content: string
    created_at: string
    id: string
    lat: number | null
    lng: number | null
    offline_id: string
    photo_urls: string[]
    place_name: string | null
    tagging_status: string
    trip_id: string
    updated_at: string
    user_id: string
  }
  Insert: {
    captured_at?: string
    category?: string | null
    city?: string | null
    content: string
    created_at?: string
    id?: string
    lat?: number | null
    lng?: number | null
    offline_id: string
    photo_urls?: string[]
    place_name?: string | null
    tagging_status?: string
    trip_id: string
    updated_at?: string
    user_id: string
  }
  Update: {
    captured_at?: string
    category?: string | null
    city?: string | null
    content?: string
    created_at?: string
    id?: string
    lat?: number | null
    lng?: number | null
    offline_id?: string
    photo_urls?: string[]
    place_name?: string | null
    tagging_status?: string
    trip_id?: string
    updated_at?: string
    user_id?: string
  }
  Relationships: [
    {
      foreignKeyName: "notes_trip_id_fkey"
      columns: ["trip_id"]
      isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    },
  ]
}
```

- [ ] **Step 6: Verify TypeScript compiles**

Run:
```bash
npx tsc --noEmit
```
Expected: No errors (the `Note` type in `noteHelpers.ts` inherits `photo_urls` automatically from `NoteRow`).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/006_photos.sql src/lib/database.types.ts package.json
git commit -m "feat: add photo_urls to notes + install expo-image-picker"
```

---

### Task 2: TDD `photoHelpers.ts`

**Files:**
- Create: `src/services/photoHelpers.ts`
- Create: `src/services/__tests__/photoHelpers.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/services/__tests__/photoHelpers.test.ts`:

```typescript
import { parseDMS, extractExifLocation, validatePhotoCount } from '../photoHelpers';

describe('parseDMS', () => {
  it('converts north latitude to positive decimal degrees', () => {
    // Paris latitude: 48° 51' 30" N = 48.858333...
    expect(parseDMS([48, 51, 30], 'N')).toBeCloseTo(48.8583, 4);
  });

  it('converts south latitude to negative decimal degrees', () => {
    // Sydney latitude: 33° 51' 54" S = -33.865
    expect(parseDMS([33, 51, 54], 'S')).toBeCloseTo(-33.865, 4);
  });

  it('converts east longitude to positive decimal degrees', () => {
    // Paris longitude: 2° 21' 3.6" E = 2.351
    expect(parseDMS([2, 21, 3.6], 'E')).toBeCloseTo(2.351, 4);
  });

  it('converts west longitude to negative decimal degrees', () => {
    // New York longitude: 73° 56' 6" W = -73.935
    expect(parseDMS([73, 56, 6], 'W')).toBeCloseTo(-73.935, 4);
  });
});

describe('extractExifLocation', () => {
  it('returns lat/lng for a valid EXIF object with all GPS fields', () => {
    const exif = {
      GPSLatitude: [48, 51, 30],
      GPSLatitudeRef: 'N',
      GPSLongitude: [2, 21, 3.6],
      GPSLongitudeRef: 'E',
    };
    const result = extractExifLocation(exif);
    expect(result).not.toBeNull();
    expect(result!.lat).toBeCloseTo(48.8583, 4);
    expect(result!.lng).toBeCloseTo(2.351, 4);
  });

  it('returns null when GPS latitude is missing', () => {
    expect(extractExifLocation({ GPSLongitude: [2, 21, 3.6], GPSLongitudeRef: 'E' })).toBeNull();
  });

  it('returns null when GPS ref is missing', () => {
    expect(extractExifLocation({ GPSLatitude: [48, 51, 30], GPSLongitude: [2, 21, 3.6] })).toBeNull();
  });

  it('returns null for empty EXIF object', () => {
    expect(extractExifLocation({})).toBeNull();
  });

  it('returns null when lat array has wrong length (not 3 elements)', () => {
    const exif = {
      GPSLatitude: [48, 51],           // only 2 elements
      GPSLatitudeRef: 'N',
      GPSLongitude: [2, 21, 3.6],
      GPSLongitudeRef: 'E',
    };
    expect(extractExifLocation(exif)).toBeNull();
  });

  it('returns null when GPS values are strings instead of numbers', () => {
    const exif = {
      GPSLatitude: ['48', '51', '30'],  // strings, not numbers
      GPSLatitudeRef: 'N',
      GPSLongitude: [2, 21, 3.6],
      GPSLongitudeRef: 'E',
    };
    expect(extractExifLocation(exif)).toBeNull();
  });

  it('returns null when ref is an invalid value', () => {
    const exif = {
      GPSLatitude: [48, 51, 30],
      GPSLatitudeRef: 'X',             // not N/S
      GPSLongitude: [2, 21, 3.6],
      GPSLongitudeRef: 'E',
    };
    expect(extractExifLocation(exif)).toBeNull();
  });

  it('applies negative sign for S latitude ref', () => {
    const exif = {
      GPSLatitude: [33, 51, 54],
      GPSLatitudeRef: 'S',
      GPSLongitude: [151, 12, 36],
      GPSLongitudeRef: 'E',
    };
    const result = extractExifLocation(exif);
    expect(result!.lat).toBeLessThan(0);
    expect(result!.lng).toBeGreaterThan(0);
  });
});

describe('validatePhotoCount', () => {
  it('returns true for 0 photos', () => {
    expect(validatePhotoCount(0)).toBe(true);
  });
  it('returns true for exactly 5 photos', () => {
    expect(validatePhotoCount(5)).toBe(true);
  });
  it('returns false for 6 photos', () => {
    expect(validatePhotoCount(6)).toBe(false);
  });
  it('returns false for counts above 5', () => {
    expect(validatePhotoCount(10)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run:
```bash
npx jest src/services/__tests__/photoHelpers.test.ts --no-coverage
```
Expected: FAIL — `Cannot find module '../photoHelpers'`

- [ ] **Step 3: Implement `photoHelpers.ts`**

Create `src/services/photoHelpers.ts`:

```typescript
export function parseDMS(dms: number[], ref: 'N' | 'S' | 'E' | 'W'): number {
  const decimal = dms[0] + dms[1] / 60 + dms[2] / 3600;
  return ref === 'S' || ref === 'W' ? -decimal : decimal;
}

export function extractExifLocation(
  exif: Record<string, unknown>,
): { lat: number; lng: number } | null {
  const latArr = exif['GPSLatitude'];
  const latRef = exif['GPSLatitudeRef'];
  const lngArr = exif['GPSLongitude'];
  const lngRef = exif['GPSLongitudeRef'];

  if (!Array.isArray(latArr) || !Array.isArray(lngArr)) return null;
  if (typeof latRef !== 'string' || typeof lngRef !== 'string') return null;
  if (latArr.length !== 3 || lngArr.length !== 3) return null;
  if (!latArr.every((v) => typeof v === 'number')) return null;
  if (!lngArr.every((v) => typeof v === 'number')) return null;
  if (!['N', 'S'].includes(latRef) || !['E', 'W'].includes(lngRef)) return null;

  return {
    lat: parseDMS(latArr as number[], latRef as 'N' | 'S'),
    lng: parseDMS(lngArr as number[], lngRef as 'E' | 'W'),
  };
}

export function validatePhotoCount(count: number): boolean {
  return count <= 5;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run:
```bash
npx jest src/services/__tests__/photoHelpers.test.ts --no-coverage
```
Expected: PASS — all 13 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/services/photoHelpers.ts src/services/__tests__/photoHelpers.test.ts
git commit -m "feat: add photoHelpers — DMS parsing, EXIF extraction, count validation"
```

---

### Task 3: TDD `photoService.ts`

**Files:**
- Create: `src/services/photoService.ts`
- Create: `src/services/__tests__/photoService.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/services/__tests__/photoService.test.ts`:

```typescript
const mockUpload = jest.fn();
const mockGetPublicUrl = jest.fn();
const mockRemove = jest.fn();
const mockFrom = {
  upload: mockUpload,
  getPublicUrl: mockGetPublicUrl,
  remove: mockRemove,
};

jest.mock('../../lib/supabase', () => ({
  supabase: {
    storage: {
      from: jest.fn().mockReturnValue(mockFrom),
    },
  },
}));

// Mock global fetch for URI → Blob conversion
const mockBlob = new Blob(['fake-image-data'], { type: 'image/jpeg' });
const mockFetchResponse = { blob: jest.fn().mockResolvedValue(mockBlob) };
global.fetch = jest.fn().mockResolvedValue(mockFetchResponse) as jest.Mock;

import { uploadPhoto, deletePhotos } from '../photoService';

beforeEach(() => {
  jest.clearAllMocks();
  (global.fetch as jest.Mock).mockResolvedValue(mockFetchResponse);
});

describe('uploadPhoto', () => {
  it('uploads the photo and returns the public URL', async () => {
    mockUpload.mockResolvedValueOnce({ data: { path: 'user1/note1/0.jpg' }, error: null });
    mockGetPublicUrl.mockReturnValueOnce({
      data: { publicUrl: 'https://example.com/photos/user1/note1/0.jpg' },
    });

    const url = await uploadPhoto('user1', 'note1', 0, 'file:///photo.jpg');

    expect(global.fetch).toHaveBeenCalledWith('file:///photo.jpg');
    expect(mockUpload).toHaveBeenCalledWith(
      'user1/note1/0.jpg',
      mockBlob,
      { contentType: 'image/jpeg', upsert: true },
    );
    expect(mockGetPublicUrl).toHaveBeenCalledWith('user1/note1/0.jpg');
    expect(url).toBe('https://example.com/photos/user1/note1/0.jpg');
  });

  it('throws when supabase upload returns an error', async () => {
    mockUpload.mockResolvedValueOnce({ data: null, error: new Error('Storage error') });

    await expect(uploadPhoto('user1', 'note1', 0, 'file:///photo.jpg')).rejects.toThrow('Storage error');
    expect(mockGetPublicUrl).not.toHaveBeenCalled();
  });
});

describe('deletePhotos', () => {
  it('removes extracted paths from storage', async () => {
    mockRemove.mockResolvedValueOnce({ data: [], error: null });

    await deletePhotos([
      'https://example.supabase.co/storage/v1/object/public/photos/user1/note1/0.jpg',
      'https://example.supabase.co/storage/v1/object/public/photos/user1/note1/1.jpg',
    ]);

    expect(mockRemove).toHaveBeenCalledWith([
      'user1/note1/0.jpg',
      'user1/note1/1.jpg',
    ]);
  });

  it('does nothing when the URL list is empty', async () => {
    await deletePhotos([]);
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('does not throw on storage error (best-effort)', async () => {
    mockRemove.mockRejectedValueOnce(new Error('Network error'));

    await expect(
      deletePhotos(['https://example.supabase.co/storage/v1/object/public/photos/user1/note1/0.jpg']),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run:
```bash
npx jest src/services/__tests__/photoService.test.ts --no-coverage
```
Expected: FAIL — `Cannot find module '../photoService'`

- [ ] **Step 3: Implement `photoService.ts`**

Create `src/services/photoService.ts`:

```typescript
import { supabase } from '../lib/supabase';

export async function uploadPhoto(
  userId: string,
  noteOfflineId: string,
  index: number,
  uri: string,
): Promise<string> {
  const path = `${userId}/${noteOfflineId}/${index}.jpg`;
  const response = await fetch(uri);
  const blob = await response.blob();

  const { error } = await supabase.storage
    .from('photos')
    .upload(path, blob, { contentType: 'image/jpeg', upsert: true });

  if (error) throw error;

  const { data } = supabase.storage.from('photos').getPublicUrl(path);
  return data.publicUrl;
}

export async function deletePhotos(urls: string[]): Promise<void> {
  const paths = urls
    .map((url) => {
      const match = url.match(/\/photos\/(.+)$/);
      return match ? match[1] : null;
    })
    .filter((p): p is string => p !== null);

  if (paths.length === 0) return;

  await supabase.storage.from('photos').remove(paths).catch(() => {});
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run:
```bash
npx jest src/services/__tests__/photoService.test.ts --no-coverage
```
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/services/photoService.ts src/services/__tests__/photoService.test.ts
git commit -m "feat: add photoService — upload to Supabase Storage, delete best-effort"
```

---

### Task 4: TDD `usePhotoPicker.ts`

**Files:**
- Create: `src/hooks/usePhotoPicker.ts`
- Create: `src/hooks/__tests__/usePhotoPicker.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/__tests__/usePhotoPicker.test.ts`:

```typescript
import { renderHook, act } from '@testing-library/react-native';
import { Alert } from 'react-native';

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  MediaTypeOptions: { Images: 'Images' },
}));

jest.mock('../../services/photoHelpers', () => ({
  extractExifLocation: jest.fn(),
}));

import * as ImagePicker from 'expo-image-picker';
import { extractExifLocation } from '../../services/photoHelpers';

const mockRequestPermissions = ImagePicker.requestMediaLibraryPermissionsAsync as jest.MockedFunction<
  typeof ImagePicker.requestMediaLibraryPermissionsAsync
>;
const mockLaunchLibrary = ImagePicker.launchImageLibraryAsync as jest.MockedFunction<
  typeof ImagePicker.launchImageLibraryAsync
>;
const mockExtractExif = extractExifLocation as jest.MockedFunction<typeof extractExifLocation>;

const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

beforeEach(() => {
  jest.clearAllMocks();
  mockRequestPermissions.mockResolvedValue({ status: 'granted', granted: true, expires: 'never', canAskAgain: true });
  mockExtractExif.mockReturnValue(null);
});

import { usePhotoPicker } from '../usePhotoPicker';

describe('usePhotoPicker', () => {
  it('starts with an empty photos array', () => {
    const { result } = renderHook(() => usePhotoPicker());
    expect(result.current.photos).toEqual([]);
  });

  it('shows an alert and adds no photos when permission is denied', async () => {
    mockRequestPermissions.mockResolvedValueOnce({
      status: 'denied',
      granted: false,
      expires: 'never',
      canAskAgain: false,
    });
    const { result } = renderHook(() => usePhotoPicker());
    await act(async () => { await result.current.pick(); });
    expect(alertSpy).toHaveBeenCalledWith(
      'Photo access required',
      expect.any(String),
    );
    expect(result.current.photos).toEqual([]);
    expect(mockLaunchLibrary).not.toHaveBeenCalled();
  });

  it('adds photos to state when picker returns assets', async () => {
    mockLaunchLibrary.mockResolvedValueOnce({
      canceled: false,
      assets: [
        { uri: 'file:///a.jpg', width: 100, height: 100, exif: null },
        { uri: 'file:///b.jpg', width: 200, height: 200, exif: null },
      ],
    } as never);
    const { result } = renderHook(() => usePhotoPicker());
    await act(async () => { await result.current.pick(); });
    expect(result.current.photos).toHaveLength(2);
    expect(result.current.photos[0].uri).toBe('file:///a.jpg');
    expect(result.current.photos[1].uri).toBe('file:///b.jpg');
  });

  it('does nothing when picker is cancelled', async () => {
    mockLaunchLibrary.mockResolvedValueOnce({ canceled: true, assets: [] } as never);
    const { result } = renderHook(() => usePhotoPicker());
    await act(async () => { await result.current.pick(); });
    expect(result.current.photos).toEqual([]);
  });

  it('extracts EXIF location from assets that have GPS data', async () => {
    const fakeExif = { GPSLatitude: [48, 51, 30], GPSLatitudeRef: 'N', GPSLongitude: [2, 21, 3.6], GPSLongitudeRef: 'E' };
    mockLaunchLibrary.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///a.jpg', width: 100, height: 100, exif: fakeExif }],
    } as never);
    mockExtractExif.mockReturnValueOnce({ lat: 48.858, lng: 2.351 });

    const { result } = renderHook(() => usePhotoPicker());
    await act(async () => { await result.current.pick(); });

    expect(mockExtractExif).toHaveBeenCalledWith(fakeExif);
    expect(result.current.photos[0].exifLocation).toEqual({ lat: 48.858, lng: 2.351 });
  });

  it('sets exifLocation to null when asset has no EXIF', async () => {
    mockLaunchLibrary.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///a.jpg', width: 100, height: 100, exif: null }],
    } as never);
    const { result } = renderHook(() => usePhotoPicker());
    await act(async () => { await result.current.pick(); });
    expect(result.current.photos[0].exifLocation).toBeNull();
  });

  it('calls launchImageLibraryAsync with correct options', async () => {
    mockLaunchLibrary.mockResolvedValueOnce({ canceled: true, assets: [] } as never);
    const { result } = renderHook(() => usePhotoPicker());
    await act(async () => { await result.current.pick(); });
    expect(mockLaunchLibrary).toHaveBeenCalledWith({
      allowsMultipleSelection: true,
      selectionLimit: 5,
      exif: true,
      quality: 0.7,
      mediaTypes: 'Images',
    });
  });

  it('removes a photo at the given index', async () => {
    mockLaunchLibrary.mockResolvedValueOnce({
      canceled: false,
      assets: [
        { uri: 'file:///a.jpg', width: 100, height: 100, exif: null },
        { uri: 'file:///b.jpg', width: 200, height: 200, exif: null },
      ],
    } as never);
    const { result } = renderHook(() => usePhotoPicker());
    await act(async () => { await result.current.pick(); });
    act(() => { result.current.remove(0); });
    expect(result.current.photos).toHaveLength(1);
    expect(result.current.photos[0].uri).toBe('file:///b.jpg');
  });

  it('clear() empties the photos array', async () => {
    mockLaunchLibrary.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///a.jpg', width: 100, height: 100, exif: null }],
    } as never);
    const { result } = renderHook(() => usePhotoPicker());
    await act(async () => { await result.current.pick(); });
    expect(result.current.photos).toHaveLength(1);
    act(() => { result.current.clear(); });
    expect(result.current.photos).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run:
```bash
npx jest src/hooks/__tests__/usePhotoPicker.test.ts --no-coverage
```
Expected: FAIL — `Cannot find module '../usePhotoPicker'`

- [ ] **Step 3: Implement `usePhotoPicker.ts`**

Create `src/hooks/usePhotoPicker.ts`:

```typescript
import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import { extractExifLocation } from '../services/photoHelpers';

export type PickedPhoto = {
  uri: string;
  width: number;
  height: number;
  exifLocation: { lat: number; lng: number } | null;
};

type UsePhotoPickerResult = {
  photos: PickedPhoto[];
  pick: () => Promise<void>;
  remove: (index: number) => void;
  clear: () => void;
};

export function usePhotoPicker(): UsePhotoPickerResult {
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);

  const pick = async () => {
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) {
      Alert.alert('Photo access required', 'Go to Settings to allow photo access.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      selectionLimit: 5,
      exif: true,
      quality: 0.7,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });

    if (result.canceled) return;

    const picked: PickedPhoto[] = result.assets.map((asset) => ({
      uri: asset.uri,
      width: asset.width,
      height: asset.height,
      exifLocation: asset.exif
        ? extractExifLocation(asset.exif as Record<string, unknown>)
        : null,
    }));

    setPhotos((prev) => [...prev, ...picked].slice(0, 5));
  };

  const remove = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const clear = () => setPhotos([]);

  return { photos, pick, remove, clear };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run:
```bash
npx jest src/hooks/__tests__/usePhotoPicker.test.ts --no-coverage
```
Expected: PASS — all 8 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/usePhotoPicker.ts src/hooks/__tests__/usePhotoPicker.test.ts
git commit -m "feat: add usePhotoPicker hook — permissions, multi-select, EXIF extraction"
```

---

### Task 5: Create `PhotoStrip` component

**Files:**
- Create: `src/components/PhotoStrip.tsx`

- [ ] **Step 1: Create `PhotoStrip.tsx`**

Create `src/components/PhotoStrip.tsx`:

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/PhotoStrip.tsx
git commit -m "feat: add PhotoStrip component — horizontal thumbnail row with +N overflow"
```

---

### Task 6: Create `PhotoGrid` component

**Files:**
- Create: `src/components/PhotoGrid.tsx`

- [ ] **Step 1: Create `PhotoGrid.tsx`**

Create `src/components/PhotoGrid.tsx`:

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/PhotoGrid.tsx
git commit -m "feat: add PhotoGrid component — 3-col grid for TripFeedScreen header"
```

---

### Task 7: Update `noteService.ts` to accept `photo_urls` and `offline_id`

**Files:**
- Modify: `src/services/noteService.ts`

- [ ] **Step 1: Update `noteService.ts`**

Replace the entire contents of `src/services/noteService.ts` with:

```typescript
import * as Crypto from 'expo-crypto';
import { supabase } from '../lib/supabase';
import type { Note, NoteInsert, Category } from './noteHelpers';
import {
  enqueue,
  peekAll,
  removeByOfflineId,
  type PendingNote,
} from './offlineQueue';

export type CreateNoteInput = {
  userId: string;
  tripId: string;
  content: string;
  category: Category | null;
  lat: number | null;
  lng: number | null;
  city: string | null;
  photo_urls?: string[];
  offline_id?: string;
};

export async function createNote(input: CreateNoteInput): Promise<PendingNote> {
  const pending: PendingNote = {
    offline_id: input.offline_id ?? Crypto.randomUUID(),
    user_id: input.userId,
    trip_id: input.tripId,
    content: input.content,
    category: input.category,
    lat: input.lat,
    lng: input.lng,
    city: input.city,
    captured_at: new Date().toISOString(),
  };

  await enqueue(pending);
  void trySync(pending, input.photo_urls ?? []);
  return pending;
}

async function trySync(pending: PendingNote, photoUrls: string[] = []): Promise<void> {
  const row: NoteInsert = {
    user_id: pending.user_id,
    trip_id: pending.trip_id,
    content: pending.content,
    category: pending.category ?? null,
    lat: pending.lat,
    lng: pending.lng,
    city: pending.city,
    offline_id: pending.offline_id,
    captured_at: pending.captured_at,
    photo_urls: photoUrls,
  };

  const { error } = await supabase
    .from('notes')
    .upsert(row, { onConflict: 'offline_id', ignoreDuplicates: true });

  if (!error) {
    await removeByOfflineId(pending.offline_id);
  }
}

export async function listNotes(tripId: string): Promise<Note[]> {
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('trip_id', tripId)
    .order('captured_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as Note[];
}

export async function drainQueue(): Promise<number> {
  const items = await peekAll();
  let synced = 0;
  for (const item of items) {
    const row: NoteInsert = {
      user_id: item.user_id,
      trip_id: item.trip_id,
      content: item.content,
      category: item.category ?? null,
      lat: item.lat,
      lng: item.lng,
      city: item.city,
      offline_id: item.offline_id,
      captured_at: item.captured_at,
      photo_urls: [],
    };
    const { error } = await supabase
      .from('notes')
      .upsert(row, { onConflict: 'offline_id', ignoreDuplicates: true });
    if (!error) {
      await removeByOfflineId(item.offline_id);
      synced += 1;
    }
  }
  return synced;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run:
```bash
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 3: Run existing noteService-related tests to confirm nothing broke**

Run:
```bash
npx jest --no-coverage
```
Expected: All existing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add src/services/noteService.ts
git commit -m "feat: noteService accepts photo_urls and optional pre-generated offline_id"
```

---

### Task 8: Wire `PhotoStrip` into `NoteCard`

**Files:**
- Modify: `src/components/NoteCard.tsx`

- [ ] **Step 1: Update `ServerNoteCard` in `NoteCard.tsx` to render `PhotoStrip`**

In `src/components/NoteCard.tsx`:

Add the import at the top (after existing imports):
```typescript
import PhotoStrip from './PhotoStrip';
```

Replace the `ServerNoteCard` function:
```typescript
function ServerNoteCard({ note }: { note: Note }) {
  const showShimmer = note.tagging_status === 'pending' && !note.category;
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        {note.category ? (
          <CategoryBadge category={note.category} />
        ) : showShimmer ? (
          <ShimmerBadge />
        ) : null}
        <Text style={styles.meta}>
          {[note.city, formatRelativeTime(note.captured_at)].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <Text style={styles.content} numberOfLines={3}>{note.content}</Text>
      {note.photo_urls.length > 0 && <PhotoStrip urls={note.photo_urls} />}
    </View>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run:
```bash
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/NoteCard.tsx
git commit -m "feat: NoteCard renders PhotoStrip when note has photos"
```

---

### Task 9: Wire `PhotoGrid` into `TripFeedScreen`

**Files:**
- Modify: `src/screens/trip/TripFeedScreen.tsx`

- [ ] **Step 1: Update `TripFeedScreen.tsx` to add `PhotoGrid` as the FlatList header**

Replace the entire contents of `src/screens/trip/TripFeedScreen.tsx`:

```typescript
import { FlatList, View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useNotes } from '../../hooks/useNotes';
import NoteCard from '../../components/NoteCard';
import PhotoGrid from '../../components/PhotoGrid';
import { Colors, Spacing, Typography } from '../../theme';

type Props = { tripId: string };

export default function TripFeedScreen({ tripId }: Props) {
  const { items, loading, error } = useNotes(tripId);

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

  if (items.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>No notes yet.</Text>
        <Text style={styles.emptyBody}>
          Tap the + button to capture your first memory.
        </Text>
      </View>
    );
  }

  const allPhotoUrls = items
    .filter((item) => item.kind === 'note')
    .flatMap((item) => (item.kind === 'note' ? item.note.photo_urls : []));

  return (
    <FlatList
      data={items}
      keyExtractor={(item) =>
        item.kind === 'note' ? `note:${item.note.id}` : `pending:${item.pending.offline_id}`
      }
      renderItem={({ item }) => <NoteCard item={item} />}
      contentContainerStyle={styles.list}
      ListHeaderComponent={<PhotoGrid photoUrls={allPhotoUrls} />}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  list: { paddingTop: Spacing.md, paddingBottom: 96 },
  emptyTitle: { ...Typography.heading, color: Colors.textPrimary, marginBottom: Spacing.xs },
  emptyBody: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center' },
  error: { ...Typography.body, color: Colors.error, textAlign: 'center' },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

Run:
```bash
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/screens/trip/TripFeedScreen.tsx
git commit -m "feat: TripFeedScreen shows PhotoGrid header when notes have photos"
```

---

### Task 10: Wire up `NoteCaptureSheet` — photo picker, preview strip, EXIF override, offline guard, upload on save

**Files:**
- Modify: `src/components/NoteCaptureSheet.tsx`

- [ ] **Step 1: Replace `NoteCaptureSheet.tsx` with the photo-wired version**

Replace the entire contents of `src/components/NoteCaptureSheet.tsx`:

```typescript
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Animated,
  ActivityIndicator,
  ScrollView,
  Image,
} from 'react-native';
import * as Crypto from 'expo-crypto';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../contexts/AuthContext';
import { useTrips } from '../hooks/useTrips';
import { useLocation } from '../hooks/useLocation';
import { useVoiceRecording } from '../hooks/useVoiceRecording';
import { usePhotoPicker } from '../hooks/usePhotoPicker';
import { useConnectivity } from '../hooks/useConnectivity';
import { createNote } from '../services/noteService';
import { uploadPhoto } from '../services/photoService';
import { detectIntent } from '../services/voiceService';
import { validateContent, type Category } from '../services/noteHelpers';
import CategoryPicker from './CategoryPicker';
import TripSelector from './TripSelector';
import { Colors, Spacing, BorderRadius } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  onStartTrip: () => void;
  onSearchIntent: (query: string) => void;
  /** When true, start voice recording as soon as the sheet opens. */
  autoRecord?: boolean;
};

export default function NoteCaptureSheet({
  visible,
  onClose,
  onStartTrip,
  onSearchIntent,
  autoRecord = false,
}: Props) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const { trips } = useTrips(userId);
  const { fix, loading: locating, fetch: fetchLocation } = useLocation();
  const voice = useVoiceRecording();
  const photoPicker = usePhotoPicker();
  const { isOnline } = useConnectivity();

  const activeTrips = useMemo(() => trips.filter((t) => t.status === 'active'), [trips]);

  const [content, setContent] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [intentLoading, setIntentLoading] = useState(false);
  const [exifCity, setExifCity] = useState<string | null>(null);

  // Pulsing ring animation for recording state
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (voice.status === 'recording') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.35, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [voice.status, pulseAnim]);

  // Reverse-geocode EXIF GPS from the first photo that has it
  const exifLocation = useMemo(
    () => photoPicker.photos.find((p) => p.exifLocation)?.exifLocation ?? null,
    [photoPicker.photos],
  );

  useEffect(() => {
    if (!exifLocation) { setExifCity(null); return; }
    let cancelled = false;
    Location.reverseGeocodeAsync({ latitude: exifLocation.lat, longitude: exifLocation.lng })
      .then(([geo]) => {
        if (!cancelled) setExifCity(geo?.city ?? geo?.district ?? null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [exifLocation]);

  // Handle completed transcription.
  // NOTE: voice.reset() is intentionally called AFTER detectIntent resolves, not
  // before. Calling it first changes voice.status + voice.finalTranscript (both
  // deps), which triggers the effect cleanup and sets cancelled=true before the
  // async work finishes — permanently blocking setIntentLoading(false).
  useEffect(() => {
    if (voice.status !== 'done' || !voice.finalTranscript) return;
    const transcript = voice.finalTranscript;
    let cancelled = false;
    setIntentLoading(true);
    detectIntent(transcript)
      .then((result) => {
        if (cancelled) return;
        voice.reset();
        if (result.intent === 'search') {
          onClose();
          onSearchIntent(result.text);
        } else {
          setContent(result.text);
        }
      })
      .catch(() => {
        if (!cancelled) {
          voice.reset();
          setContent(transcript);
        }
      })
      .finally(() => {
        if (!cancelled) setIntentLoading(false);
      });
    return () => { cancelled = true; };
  }, [voice.status, voice.finalTranscript, voice.reset, onClose, onSearchIntent]);

  useEffect(() => {
    if (!visible) return;
    if (activeTrips.length === 0) setSelectedTripId(null);
    else if (!selectedTripId || !activeTrips.some((t) => t.id === selectedTripId)) {
      setSelectedTripId(activeTrips[0].id);
    }
  }, [visible, activeTrips, selectedTripId]);

  useEffect(() => {
    if (!visible) return;
    setContent('');
    setCategory(null);
    setIntentLoading(false);
    setExifCity(null);
    photoPicker.clear();
    voice.reset();
    void fetchLocation();
    if (autoRecord) {
      void voice.start();
    }
  }, [visible, fetchLocation]); // eslint-disable-line react-hooks/exhaustive-deps

  const photos = photoPicker.photos;
  const photosBlockSave = photos.length > 0 && !isOnline;
  const canSave =
    !saving &&
    !intentLoading &&
    selectedTripId !== null &&
    validateContent(content).ok &&
    !photosBlockSave;

  const handleSave = async () => {
    if (!userId || !selectedTripId) return;
    const validation = validateContent(content);
    if (!validation.ok) {
      Alert.alert(
        'Cannot save note',
        validation.reason === 'empty' ? 'Add some text first.' : 'Note is too long (max 8000 chars).',
      );
      return;
    }
    setSaving(true);
    try {
      const offlineId = Crypto.randomUUID();

      // Upload photos sequentially
      let uploadedUrls: string[] = [];
      if (photos.length > 0) {
        let allUploaded = true;
        for (let i = 0; i < photos.length; i++) {
          try {
            const url = await uploadPhoto(userId, offlineId, i, photos[i].uri);
            uploadedUrls.push(url);
          } catch {
            allUploaded = false;
            break;
          }
        }

        if (!allUploaded) {
          let saveWithout = false;
          await new Promise<void>((resolve) => {
            Alert.alert(
              'Upload failed',
              'Some photos could not be uploaded.',
              [
                { text: 'Cancel', style: 'cancel', onPress: resolve },
                { text: 'Save without photos', onPress: () => { saveWithout = true; resolve(); } },
              ],
            );
          });
          if (!saveWithout) return;
          uploadedUrls = [];
        }
      }

      // Determine final location: EXIF overrides live GPS
      const latest = await fetchLocation();
      const noteLat = exifLocation ? exifLocation.lat : (latest?.lat ?? fix?.lat ?? null);
      const noteLng = exifLocation ? exifLocation.lng : (latest?.lng ?? fix?.lng ?? null);
      const noteCity = exifLocation ? exifCity : (latest?.city ?? fix?.city ?? null);

      await createNote({
        userId,
        tripId: selectedTripId,
        content: validation.value,
        category,
        lat: noteLat,
        lng: noteLng,
        city: noteCity,
        photo_urls: uploadedUrls,
        offline_id: offlineId,
      });

      photoPicker.clear();
      onClose();
    } catch (e) {
      Alert.alert('Could not save note', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleMicPress = async () => {
    if (intentLoading) return;
    if (voice.status === 'recording') {
      voice.stop();
    } else if (voice.status === 'idle' || voice.status === 'error') {
      await voice.start();
    }
  };

  const displayCity = exifCity ?? (locating ? null : fix?.city ?? null);
  const locationLabel = locating && !exifCity
    ? '📍 Locating…'
    : displayCity
    ? `📍 ${displayCity}`
    : '📍 No location';

  const isRecording = voice.status === 'recording';
  const micLabel =
    intentLoading
      ? 'Thinking…'
      : isRecording
      ? (voice.partialTranscript || 'Listening…')
      : voice.status === 'error'
      ? (voice.error ?? 'Try again')
      : 'Hold to record';
  const micLabelColor =
    voice.status === 'error' ? Colors.error : isRecording ? Colors.accent : '#555555';

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      animationType="slide"
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.handleRow}>
          <View style={styles.handle} />
        </View>

        <TripSelector
          activeTrips={activeTrips}
          selectedTripId={selectedTripId}
          onSelect={setSelectedTripId}
          onStartTrip={() => {
            onClose();
            onStartTrip();
          }}
        />

        <View style={styles.micSection}>
          <Pressable
            onPress={handleMicPress}
            accessibilityRole="button"
            accessibilityLabel={isRecording ? 'Stop recording' : 'Start voice recording'}
            style={styles.micOuter}
          >
            {isRecording && (
              <Animated.View
                style={[styles.micRing, { transform: [{ scale: pulseAnim }] }]}
              />
            )}
            <LinearGradient
              colors={['#E08040', '#C0581A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.micButton, !isRecording && styles.micButtonIdle]}
            >
              {intentLoading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.micEmoji}>{isRecording ? '⏹' : '🎙️'}</Text>
              )}
            </LinearGradient>
          </Pressable>
          <Text style={[styles.micHint, { color: micLabelColor }]} numberOfLines={2}>
            {micLabel}
          </Text>
        </View>

        <View style={styles.orDivider}>
          <View style={styles.orLine} />
          <Text style={styles.orText}>OR</Text>
          <View style={styles.orLine} />
        </View>

        <TextInput
          value={content}
          onChangeText={setContent}
          placeholder="What's on your mind?"
          placeholderTextColor={Colors.textSecondary}
          multiline
          autoFocus={!isRecording}
          style={styles.input}
        />

        <CategoryPicker value={category} onChange={setCategory} />

        {photos.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.previewStrip}
            contentContainerStyle={styles.previewStripContent}
          >
            {photos.map((photo, index) => (
              <View key={photo.uri} style={styles.previewThumbContainer}>
                <Image source={{ uri: photo.uri }} style={styles.previewThumb} resizeMode="cover" />
                <Pressable
                  style={styles.removeButton}
                  onPress={() => photoPicker.remove(index)}
                  accessibilityRole="button"
                  accessibilityLabel="Remove photo"
                >
                  <Text style={styles.removeButtonText}>×</Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        )}

        {photosBlockSave && (
          <Text style={styles.offlineWarning}>Connect to save with photos</Text>
        )}

        <View style={styles.actionRow}>
          <Pressable
            onPress={photoPicker.pick}
            accessibilityRole="button"
            accessibilityLabel="Add photos"
            style={[styles.photoButton, photos.length > 0 && styles.photoButtonActive]}
          >
            <Text style={styles.photoButtonLabel}>📷</Text>
          </Pressable>
          <View style={styles.locationPill}>
            <Text style={styles.locationPillText}>{locationLabel}</Text>
          </View>
          <Pressable
            onPress={handleSave}
            disabled={!canSave}
            style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
            accessibilityRole="button"
          >
            <Text style={styles.saveLabel}>{saving ? 'Saving…' : 'Save'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },
  handleRow: { alignItems: 'center', paddingVertical: Spacing.sm },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border },
  micSection: { alignItems: 'center', paddingVertical: Spacing.md },
  micOuter: { alignItems: 'center', justifyContent: 'center', width: 80, height: 80 },
  micRing: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: 'rgba(255,69,58,0.7)',
  },
  micButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButtonIdle: { opacity: 0.5 },
  micEmoji: { fontSize: 28 },
  micHint: { marginTop: Spacing.sm, fontSize: 11, textAlign: 'center', paddingHorizontal: Spacing.lg },
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: '#444444' },
  orText: { fontSize: 11, color: '#444444', fontWeight: '700' },
  input: {
    fontSize: 16,
    color: Colors.textPrimary,
    flex: 1,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: BorderRadius.input,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    textAlignVertical: 'top',
  },
  previewStrip: { maxHeight: 76 },
  previewStripContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xs,
    gap: 8,
  },
  previewThumbContainer: { position: 'relative' },
  previewThumb: { width: 60, height: 60, borderRadius: 8 },
  removeButton: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButtonText: { color: '#fff', fontSize: 14, lineHeight: 16, fontWeight: '700' },
  offlineWarning: {
    fontSize: 12,
    color: Colors.error,
    textAlign: 'center',
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.xs,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  photoButton: { padding: Spacing.xs, opacity: 0.5 },
  photoButtonActive: { opacity: 1.0 },
  photoButtonLabel: { fontSize: 20 },
  locationPill: {
    flex: 1,
    marginHorizontal: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: BorderRadius.pill,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  locationPillText: { fontSize: 12, color: Colors.textSecondary },
  saveButton: {
    backgroundColor: Colors.accent,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.button,
    minWidth: 60,
    alignItems: 'center',
  },
  saveButtonDisabled: { opacity: 0.4 },
  saveLabel: { fontSize: 16, color: Colors.background, fontWeight: '800' },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

Run:
```bash
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 3: Run the full test suite**

Run:
```bash
npx jest --no-coverage
```
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/NoteCaptureSheet.tsx
git commit -m "feat: wire photo picker into NoteCaptureSheet — preview strip, EXIF override, offline guard, upload on save"
```

---

## Manual Verification Checklist

After all tasks are complete, verify on a physical iOS device or simulator:

- [ ] Tap 📷 → photo library opens with multi-select UI
- [ ] Pick 1 photo → 60×60 thumbnail strip appears above action row; × button removes it
- [ ] Pick 5 photos → all 5 shown, picker does not allow 6th
- [ ] Pick photo with GPS EXIF → location pill updates to EXIF city
- [ ] Pick photo without GPS EXIF → location pill stays at live GPS city
- [ ] Go offline → pick a photo → Save button dims; "Connect to save with photos" message appears
- [ ] Go offline → no photos selected → Save works normally (text-only note)
- [ ] Save with 1 photo online → note appears in feed with photo thumbnail below text
- [ ] Save with 4 photos online → NoteCard shows 3 thumbnails, 3rd has "+2" overlay
- [ ] Open TripFeedScreen with photo notes → PhotoGrid appears as header above notes list
- [ ] TripFeedScreen with no photo notes → no grid, just note cards
