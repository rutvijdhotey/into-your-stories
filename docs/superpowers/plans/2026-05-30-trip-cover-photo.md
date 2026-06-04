# Trip Cover Photo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user set, change, or remove a trip's banner cover photo by picking (and cropping) an image from their device library.

**Architecture:** A `useCoverPhoto(trip)` hook owns the full flow (permission → pick+crop → upload → save URL → remove). `TripDetailScreen` stays thin: it renders an `<Image>` when `trip.cover_photo_url` is set (gradient fallback otherwise), shows an edit icon that opens an action menu, and overlays a spinner while busy. New service functions handle storage upload (with a cache-buster) and the DB column write. `useTripDetail` already subscribes to `trips` row changes, so the banner refreshes automatically after a write.

**Tech Stack:** React Native + Expo, `expo-image-picker`, Supabase storage + Postgres, Jest + `@testing-library/react-native`.

**Spec:** `docs/superpowers/specs/2026-05-30-trip-cover-photo-design.md`

---

## File Structure

- `src/services/photoHelpers.ts` (modify) — add `ensureMediaLibraryPermission()`.
- `src/hooks/usePhotoPicker.ts` (modify) — use the shared permission helper.
- `src/hooks/__tests__/usePhotoPicker.test.ts` (modify) — adapt to the helper.
- `src/services/photoService.ts` (modify) — extract `uploadToBucket`, add `uploadCoverPhoto`, strip query suffix in `deletePhotos`.
- `src/services/__tests__/photoService.test.ts` (modify) — add cover + query-strip tests.
- `src/services/tripService.ts` (modify) — add `updateCoverPhoto`.
- `src/services/__tests__/tripService.test.ts` (create) — test `updateCoverPhoto`.
- `src/hooks/useCoverPhoto.ts` (create) — the orchestration hook.
- `src/hooks/__tests__/useCoverPhoto.test.ts` (create) — hook behavior.
- `src/screens/trip/TripDetailScreen.tsx` (modify) — render Image-or-gradient, edit icon, action menu, busy overlay.

---

## Task 1: Shared media-library permission helper

**Files:**
- Modify: `src/services/photoHelpers.ts`
- Test: `src/services/__tests__/photoHelpers.test.ts`
- Modify: `src/hooks/usePhotoPicker.ts`
- Modify: `src/hooks/__tests__/usePhotoPicker.test.ts`

- [ ] **Step 1: Write the failing test**

Add to the top of `src/services/__tests__/photoHelpers.test.ts` (above existing content) the ImagePicker + Alert mocks, and a new `describe` block. If the file has no mocks yet, add these imports/mocks at the very top:

```ts
import { Alert } from 'react-native';

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
}));

import * as ImagePicker from 'expo-image-picker';
import { ensureMediaLibraryPermission } from '../photoHelpers';

const mockRequest = ImagePicker.requestMediaLibraryPermissionsAsync as jest.MockedFunction<
  typeof ImagePicker.requestMediaLibraryPermissionsAsync
>;
const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

describe('ensureMediaLibraryPermission', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns true when permission is granted', async () => {
    mockRequest.mockResolvedValueOnce({ granted: true } as never);
    await expect(ensureMediaLibraryPermission()).resolves.toBe(true);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('returns false and alerts when permission is denied', async () => {
    mockRequest.mockResolvedValueOnce({ granted: false } as never);
    await expect(ensureMediaLibraryPermission()).resolves.toBe(false);
    expect(alertSpy).toHaveBeenCalledWith('Photo access required', expect.any(String));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/services/__tests__/photoHelpers.test.ts -t "ensureMediaLibraryPermission"`
Expected: FAIL — `ensureMediaLibraryPermission is not a function`.

- [ ] **Step 3: Implement the helper**

Add to `src/services/photoHelpers.ts` (top of file add imports; append the function):

```ts
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
```

```ts
/**
 * Requests media-library permission. On denial, shows an Alert pointing the
 * user to Settings and returns false. Shared by usePhotoPicker and useCoverPhoto.
 */
export async function ensureMediaLibraryPermission(): Promise<boolean> {
  const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!granted) {
    Alert.alert('Photo access required', 'Go to Settings to allow photo access.');
    return false;
  }
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/services/__tests__/photoHelpers.test.ts -t "ensureMediaLibraryPermission"`
Expected: PASS.

- [ ] **Step 5: Refactor usePhotoPicker to use the helper**

In `src/hooks/usePhotoPicker.ts`, replace the inline permission block inside `pick`:

```ts
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) {
      Alert.alert('Photo access required', 'Go to Settings to allow photo access.');
      return;
    }
```

with:

```ts
    const granted = await ensureMediaLibraryPermission();
    if (!granted) return;
```

Add the import near the top (alongside the existing `extractExifLocation` import):

```ts
import { ensureMediaLibraryPermission, extractExifLocation } from '../services/photoHelpers';
```

Remove the now-unused `Alert` import only if nothing else in the file uses it (it isn't used elsewhere — remove `import { Alert } from 'react-native';`).

- [ ] **Step 6: Update the usePhotoPicker test mock**

In `src/hooks/__tests__/usePhotoPicker.test.ts`:

Change the photoHelpers mock to include the new function:

```ts
jest.mock('../../services/photoHelpers', () => ({
  extractExifLocation: jest.fn(),
  ensureMediaLibraryPermission: jest.fn(),
}));
```

Add an import + typed mock reference next to the existing `mockExtractExif`:

```ts
import { ensureMediaLibraryPermission } from '../../services/photoHelpers';
const mockEnsurePermission = ensureMediaLibraryPermission as jest.MockedFunction<
  typeof ensureMediaLibraryPermission
>;
```

In `beforeEach`, default the helper to granted:

```ts
  mockEnsurePermission.mockResolvedValue(true);
```

Replace the existing `'shows an alert and adds no photos when permission is denied'` test body so it drives denial through the helper (the Alert itself is now covered by the photoHelpers test):

```ts
  it('adds no photos when permission is denied', async () => {
    mockEnsurePermission.mockResolvedValueOnce(false);
    const { result } = renderHook(() => usePhotoPicker());
    await act(async () => { await result.current.pick(); });
    expect(result.current.photos).toEqual([]);
    expect(mockLaunchLibrary).not.toHaveBeenCalled();
  });
```

The `mockRequestPermissions` setup in `beforeEach` can stay (harmless) or be removed; leaving it is fine.

- [ ] **Step 7: Run the affected suites**

Run: `npx jest src/services/__tests__/photoHelpers.test.ts src/hooks/__tests__/usePhotoPicker.test.ts`
Expected: PASS (all).

- [ ] **Step 8: Commit**

```bash
git add src/services/photoHelpers.ts src/services/__tests__/photoHelpers.test.ts src/hooks/usePhotoPicker.ts src/hooks/__tests__/usePhotoPicker.test.ts
git commit -m "refactor: extract ensureMediaLibraryPermission shared by photo pickers"
```

---

## Task 2: `uploadCoverPhoto` + shared `uploadToBucket`

**Files:**
- Modify: `src/services/photoService.ts`
- Test: `src/services/__tests__/photoService.test.ts`

- [ ] **Step 1: Write the failing test**

Add a new `describe` block to `src/services/__tests__/photoService.test.ts`. Also extend the import line to include `uploadCoverPhoto`:

```ts
import { uploadPhoto, deletePhotos, uploadCoverPhoto } from '../photoService';
```

```ts
describe('uploadCoverPhoto', () => {
  it('uploads to the trip-covers path and returns a cache-busted URL', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1234);
    mockUpload.mockResolvedValueOnce({ data: { path: 'user1/trip-covers/trip1.jpg' }, error: null });
    mockGetPublicUrl.mockReturnValueOnce({
      data: { publicUrl: 'https://example.com/photos/user1/trip-covers/trip1.jpg' },
    });

    const url = await uploadCoverPhoto('user1', 'trip1', 'file:///cover.jpg');

    expect(mockUpload).toHaveBeenCalledWith(
      'user1/trip-covers/trip1.jpg',
      mockArrayBuffer,
      { contentType: 'image/jpeg', upsert: true },
    );
    expect(url).toBe('https://example.com/photos/user1/trip-covers/trip1.jpg?v=1234');
    (Date.now as jest.Mock).mockRestore();
  });

  it('throws when upload returns an error', async () => {
    mockUpload.mockResolvedValueOnce({ data: null, error: new Error('Storage error') });
    await expect(uploadCoverPhoto('user1', 'trip1', 'file:///cover.jpg')).rejects.toThrow('Storage error');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/services/__tests__/photoService.test.ts -t "uploadCoverPhoto"`
Expected: FAIL — `uploadCoverPhoto is not a function`.

- [ ] **Step 3: Implement (extract helper + add function)**

In `src/services/photoService.ts`, add a private helper and refactor `uploadPhoto` to use it, then add `uploadCoverPhoto`:

```ts
async function uploadToBucket(path: string, uri: string): Promise<string> {
  const response = await fetch(uri);
  const arrayBuffer = await response.arrayBuffer();

  const { error } = await supabase.storage
    .from('photos')
    .upload(path, arrayBuffer, { contentType: 'image/jpeg', upsert: true });

  if (error) throw error;

  const { data } = supabase.storage.from('photos').getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadPhoto(
  userId: string,
  noteOfflineId: string,
  index: number,
  uri: string,
): Promise<string> {
  return uploadToBucket(`${userId}/${noteOfflineId}/${index}.jpg`, uri);
}

/**
 * Uploads a trip cover to a fixed per-trip path (upsert overwrites, so no orphan
 * files accumulate). Appends a ?v= cache-buster so RN <Image> doesn't show the
 * stale cached image after a replace at the same URL.
 */
export async function uploadCoverPhoto(
  userId: string,
  tripId: string,
  uri: string,
): Promise<string> {
  const url = await uploadToBucket(`${userId}/trip-covers/${tripId}.jpg`, uri);
  return `${url}?v=${Date.now()}`;
}
```

Delete the old body of `uploadPhoto` (the inline fetch/upload/getPublicUrl) — it now lives in `uploadToBucket`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/services/__tests__/photoService.test.ts`
Expected: PASS (existing `uploadPhoto` tests still pass via the refactor; new cover tests pass).

- [ ] **Step 5: Commit**

```bash
git add src/services/photoService.ts src/services/__tests__/photoService.test.ts
git commit -m "feat: add uploadCoverPhoto with cache-buster"
```

---

## Task 3: `deletePhotos` strips query suffix

**Files:**
- Modify: `src/services/photoService.ts`
- Test: `src/services/__tests__/photoService.test.ts`

- [ ] **Step 1: Write the failing test**

Add to the existing `describe('deletePhotos', ...)` block in `src/services/__tests__/photoService.test.ts`:

```ts
  it('strips a query suffix before resolving the storage path', async () => {
    mockRemove.mockResolvedValueOnce({ data: [], error: null });

    await deletePhotos([
      'https://example.supabase.co/storage/v1/object/public/photos/user1/trip-covers/trip1.jpg?v=1234',
    ]);

    expect(mockRemove).toHaveBeenCalledWith(['user1/trip-covers/trip1.jpg']);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/services/__tests__/photoService.test.ts -t "strips a query suffix"`
Expected: FAIL — `mockRemove` called with `['user1/trip-covers/trip1.jpg?v=1234']` (query not stripped).

- [ ] **Step 3: Implement the fix**

In `src/services/photoService.ts`, update the `deletePhotos` mapping to strip the query string before matching:

```ts
  const paths = urls
    .map((url) => {
      const clean = url.split('?')[0];
      const match = clean.match(/\/photos\/(.+)$/);
      return match ? match[1] : null;
    })
    .filter((p): p is string => p !== null);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/services/__tests__/photoService.test.ts -t "deletePhotos"`
Expected: PASS (all deletePhotos cases, including the new one).

- [ ] **Step 5: Commit**

```bash
git add src/services/photoService.ts src/services/__tests__/photoService.test.ts
git commit -m "fix: strip query suffix in deletePhotos for cache-busted cover URLs"
```

---

## Task 4: `updateCoverPhoto` service

**Files:**
- Modify: `src/services/tripService.ts`
- Test: `src/services/__tests__/tripService.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/services/__tests__/tripService.test.ts`:

```ts
// Supabase query-builder mock: from('trips').update({...}).eq('id', id) resolves to { error }.
const mockEq = jest.fn();
const mockUpdate = jest.fn(() => ({ eq: mockEq }));
const mockFrom = jest.fn((_table: string) => ({ update: mockUpdate }));

jest.mock('../../lib/supabase', () => ({
  supabase: { from: (table: string) => mockFrom(table) },
}));

import { updateCoverPhoto } from '../tripService';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('updateCoverPhoto', () => {
  it('writes the cover_photo_url for the given trip', async () => {
    mockEq.mockResolvedValueOnce({ error: null });

    await expect(updateCoverPhoto('trip1', 'https://x/photos/u/trip-covers/trip1.jpg?v=1')).resolves.toBeUndefined();

    expect(mockFrom).toHaveBeenCalledWith('trips');
    expect(mockUpdate).toHaveBeenCalledWith({
      cover_photo_url: 'https://x/photos/u/trip-covers/trip1.jpg?v=1',
    });
    expect(mockEq).toHaveBeenCalledWith('id', 'trip1');
  });

  it('writes null when removing the cover', async () => {
    mockEq.mockResolvedValueOnce({ error: null });

    await updateCoverPhoto('trip1', null);

    expect(mockUpdate).toHaveBeenCalledWith({ cover_photo_url: null });
    expect(mockEq).toHaveBeenCalledWith('id', 'trip1');
  });

  it('throws when supabase returns an error', async () => {
    mockEq.mockResolvedValueOnce({ error: new Error('DB error') });

    await expect(updateCoverPhoto('trip1', null)).rejects.toThrow('DB error');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/services/__tests__/tripService.test.ts`
Expected: FAIL — `updateCoverPhoto is not a function`.

- [ ] **Step 3: Implement**

Append to `src/services/tripService.ts`:

```ts
export async function updateCoverPhoto(tripId: string, url: string | null): Promise<void> {
  const { error } = await supabase
    .from('trips')
    .update({ cover_photo_url: url })
    .eq('id', tripId);
  if (error) throw error;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/services/__tests__/tripService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/tripService.ts src/services/__tests__/tripService.test.ts
git commit -m "feat: add updateCoverPhoto trip service"
```

---

## Task 5: `useCoverPhoto` hook

**Files:**
- Create: `src/hooks/useCoverPhoto.ts`
- Test: `src/hooks/__tests__/useCoverPhoto.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/__tests__/useCoverPhoto.test.ts`:

```ts
import { renderHook, act } from '@testing-library/react-native';
import { Alert } from 'react-native';

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('../../services/photoHelpers', () => ({
  ensureMediaLibraryPermission: jest.fn(),
}));
jest.mock('../../services/photoService', () => ({
  uploadCoverPhoto: jest.fn(),
  deletePhotos: jest.fn(),
}));
jest.mock('../../services/tripService', () => ({
  updateCoverPhoto: jest.fn(),
}));
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

import * as ImagePicker from 'expo-image-picker';
import { ensureMediaLibraryPermission } from '../../services/photoHelpers';
import { uploadCoverPhoto, deletePhotos } from '../../services/photoService';
import { updateCoverPhoto } from '../../services/tripService';
import { useAuth } from '../../contexts/AuthContext';
import { useCoverPhoto } from '../useCoverPhoto';

const mockLaunch = ImagePicker.launchImageLibraryAsync as jest.MockedFunction<typeof ImagePicker.launchImageLibraryAsync>;
const mockEnsure = ensureMediaLibraryPermission as jest.MockedFunction<typeof ensureMediaLibraryPermission>;
const mockUpload = uploadCoverPhoto as jest.MockedFunction<typeof uploadCoverPhoto>;
const mockDelete = deletePhotos as jest.MockedFunction<typeof deletePhotos>;
const mockUpdate = updateCoverPhoto as jest.MockedFunction<typeof updateCoverPhoto>;
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

const trip = { id: 'trip1', cover_photo_url: null } as never;
const tripWithCover = { id: 'trip1', cover_photo_url: 'https://x/photos/u/trip-covers/trip1.jpg?v=1' } as never;

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({ session: { user: { id: 'user1' } } } as never);
  mockEnsure.mockResolvedValue(true);
});

describe('useCoverPhoto.setCover', () => {
  it('does nothing and does not upload when permission is denied', async () => {
    mockEnsure.mockResolvedValueOnce(false);
    const { result } = renderHook(() => useCoverPhoto(trip));
    await act(async () => { await result.current.setCover(); });
    expect(mockLaunch).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('is a no-op when the picker is cancelled', async () => {
    mockLaunch.mockResolvedValueOnce({ canceled: true } as never);
    const { result } = renderHook(() => useCoverPhoto(trip));
    await act(async () => { await result.current.setCover(); });
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('uploads the picked photo and saves the URL', async () => {
    mockLaunch.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///c.jpg' }] } as never);
    mockUpload.mockResolvedValueOnce('https://x/photos/user1/trip-covers/trip1.jpg?v=9');
    const { result } = renderHook(() => useCoverPhoto(trip));
    await act(async () => { await result.current.setCover(); });
    expect(mockUpload).toHaveBeenCalledWith('user1', 'trip1', 'file:///c.jpg');
    expect(mockUpdate).toHaveBeenCalledWith('trip1', 'https://x/photos/user1/trip-covers/trip1.jpg?v=9');
    expect(result.current.busy).toBe(false);
  });

  it('alerts and leaves the cover unchanged when upload fails', async () => {
    mockLaunch.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///c.jpg' }] } as never);
    mockUpload.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useCoverPhoto(trip));
    await act(async () => { await result.current.setCover(); });
    expect(alertSpy).toHaveBeenCalledWith('Could not update cover', 'boom');
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
  });
});

describe('useCoverPhoto.removeCover', () => {
  it('nulls the column and best-effort deletes the old file', async () => {
    mockUpdate.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useCoverPhoto(tripWithCover));
    await act(async () => { await result.current.removeCover(); });
    expect(mockUpdate).toHaveBeenCalledWith('trip1', null);
    expect(mockDelete).toHaveBeenCalledWith(['https://x/photos/u/trip-covers/trip1.jpg?v=1']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/hooks/__tests__/useCoverPhoto.test.ts`
Expected: FAIL — cannot find module `../useCoverPhoto`.

- [ ] **Step 3: Implement the hook**

Create `src/hooks/useCoverPhoto.ts`:

```ts
import { useState } from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ensureMediaLibraryPermission } from '../services/photoHelpers';
import { uploadCoverPhoto, deletePhotos } from '../services/photoService';
import { updateCoverPhoto } from '../services/tripService';
import { useAuth } from '../contexts/AuthContext';
import type { Trip } from '../services/tripHelpers';

type UseCoverPhotoResult = {
  setCover: () => Promise<void>;
  removeCover: () => Promise<void>;
  busy: boolean;
};

export function useCoverPhoto(trip: Trip): UseCoverPhotoResult {
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);

  const setCover = async () => {
    const userId = session?.user.id;
    if (!userId) return;

    const granted = await ensureMediaLibraryPermission();
    if (!granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: false,
      allowsEditing: true,
      quality: 0.7,
      mediaTypes: ['images'] as ImagePicker.MediaType[],
    });
    if (result.canceled) return;

    setBusy(true);
    try {
      const url = await uploadCoverPhoto(userId, trip.id, result.assets[0].uri);
      await updateCoverPhoto(trip.id, url);
    } catch (e) {
      Alert.alert('Could not update cover', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const removeCover = async () => {
    setBusy(true);
    try {
      const previous = trip.cover_photo_url;
      await updateCoverPhoto(trip.id, null);
      if (previous) void deletePhotos([previous]);
    } catch (e) {
      Alert.alert('Could not update cover', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return { setCover, removeCover, busy };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/hooks/__tests__/useCoverPhoto.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCoverPhoto.ts src/hooks/__tests__/useCoverPhoto.test.ts
git commit -m "feat: add useCoverPhoto hook"
```

---

## Task 6: Wire the banner in `TripDetailScreen`

**Files:**
- Modify: `src/screens/trip/TripDetailScreen.tsx`

No new unit test: this is presentational glue over hooks already covered by tests, and the repo has no screen-test harness (`src/screens` has no `__tests__`). Verify via `tsc`, the full Jest suite, and a manual run.

- [ ] **Step 1: Add imports**

In `src/screens/trip/TripDetailScreen.tsx`, add to the React Native import and add new imports:

```ts
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCoverPhoto } from '../../hooks/useCoverPhoto';
```

- [ ] **Step 2: Use the hook + action menu**

Inside the component, after `const gradient = getTripGradient(trip.name);`, add:

```ts
  const { setCover, removeCover, busy: coverBusy } = useCoverPhoto(trip);

  const handleEditCover = () => {
    const options = trip.cover_photo_url
      ? [
          { text: 'Choose photo', onPress: () => void setCover() },
          { text: 'Remove cover', style: 'destructive' as const, onPress: () => void removeCover() },
          { text: 'Cancel', style: 'cancel' as const },
        ]
      : [
          { text: 'Choose photo', onPress: () => void setCover() },
          { text: 'Cancel', style: 'cancel' as const },
        ];
    Alert.alert('Cover photo', undefined, options);
  };
```

- [ ] **Step 3: Render Image-or-gradient + edit icon + busy overlay**

Replace the first `<LinearGradient ... style={StyleSheet.absoluteFill} />` (the trip gradient at lines ~95-100) with a conditional background:

```tsx
        {trip.cover_photo_url ? (
          <Image
            source={{ uri: trip.cover_photo_url }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <LinearGradient
            colors={gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
```

Keep the existing dark scrim `<LinearGradient>` immediately after it unchanged.

Add the edit icon and busy overlay inside the `<View style={styles.header}>`, after the scrim and before `<View style={styles.headerContent}>`:

```tsx
        <Pressable
          style={styles.coverEditButton}
          onPress={handleEditCover}
          disabled={coverBusy}
          hitSlop={8}
        >
          <Ionicons name="camera" size={18} color="#FFFFFF" />
        </Pressable>
        {coverBusy && (
          <View style={styles.coverBusyOverlay}>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        )}
```

- [ ] **Step 4: Add styles**

Add to the `StyleSheet.create({ ... })` block:

```ts
  coverEditButton: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverBusyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
```

- [ ] **Step 5: Typecheck + full suite**

Run: `npx tsc --noEmit && npx jest`
Expected: tsc clean; all tests pass.

- [ ] **Step 6: Manual verification**

Launch the app (per the standalone-device-build / `npm start` workflow), open a trip, tap the camera icon, pick + crop a photo, confirm the banner shows it (and survives a replace, thanks to the cache-buster), then "Remove cover" and confirm it reverts to the gradient.

- [ ] **Step 7: Commit**

```bash
git add src/screens/trip/TripDetailScreen.tsx
git commit -m "feat: render and edit trip cover photo in TripDetailScreen"
```

---

## Final verification

- [ ] Run full suite + typecheck once more: `npx tsc --noEmit && npx jest`
- [ ] Update `docs/progress.md`: mark "Trip cover photo (banner image)" done, note the iOS square-crop limitation and the new `useCoverPhoto` / `uploadCoverPhoto` / `updateCoverPhoto` units.
- [ ] Use superpowers:finishing-a-development-branch to decide merge/PR.
