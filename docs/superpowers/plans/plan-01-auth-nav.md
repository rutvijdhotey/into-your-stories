# Module 1 — Auth & Navigation
**App:** Into Your Stories
**Status:** Design doc — pending approval before execution
**Note:** An existing execution plan (`2026-05-06-phase-1-scaffold-auth.md`) covers this module partially. This design doc supersedes it for architecture decisions. The execution plan needs updating before running (see correction below).

---

## Purpose

Establish the app's authentication layer and full navigation skeleton. After this module, the app is runnable: users can sign up, log in, and navigate between all primary screens (as placeholders). Every subsequent module fills in those placeholder screens.

---

## Authentication

**Provider:** Supabase Auth — email + password only in V1.

**Signup flow:**
1. User enters email + password on `SignupScreen`
2. Supabase sends a confirmation email
3. User confirms email, returns to app, lands on `DisplayNameScreen`
4. User enters display name (stored in `profiles` table — see Module 0)
5. Optional style onboarding prompt — "Add your writing style" / "Skip for now" (screen implemented in Module 12, placeholder here)
6. Lands on `HomeScreen`

**Login flow:** Email + password → session created → navigate to `HomeScreen` (if profile complete) or `DisplayNameScreen` (if display name not yet set).

**Session persistence:** Supabase client configured with AsyncStorage so sessions survive app restarts.

**AuthContext** provides to the whole app:
- `session` — current Supabase session or null
- `loading` — true while checking initial session on app start
- `profile` — the user's `profiles` row (display_name, style_profile_id)
- `signOut()` — clears session

---

## Navigation Architecture

### Top-Level: AppNavigator

AppNavigator is the root. It reads from AuthContext and decides which navigator to render:

```
AppNavigator
├── Loading screen         ← while AuthContext.loading is true
├── PublicNavigator        ← session is null
└── MainNavigator          ← session exists + profile complete
```

**Key decision: unauthenticated users land on Explore, not Login.** This is a deliberate product choice — value before commitment. Login/Signup are not the default landing; they're reached via a CTA.

---

### PublicNavigator

A stack navigator. Default screen is `ExploreScreen` (read-only, no auth required).

```
PublicNavigator (stack)
├── ExploreScreen          ← default landing for new/logged-out users
├── DestinationPage        ← tapping a destination in Explore
├── PublishedPostView      ← tapping a blog post
├── LoginScreen            ← reached via "Sign In" CTA
└── SignupScreen           ← reached via "Create Account" CTA
```

Unauthenticated users can browse all of Explore and read published posts. The floating "Start your first trip →" CTA and floating capture button are not visible here — only after auth.

---

### MainNavigator

A bottom tab navigator with a global overlay. Renders after successful auth + complete profile.

```
MainNavigator
├── FloatingCaptureButton  ← global overlay, rendered at this level
└── Tab Bar
    ├── HomeStack
    │   ├── HomeScreen
    │   └── TripDetailScreen (Feed + Map tabs — placeholders)
    ├── ExploreStack
    │   ├── ExploreScreen
    │   ├── DestinationPage
    │   └── PublishedPostView
    ├── SearchScreen
    └── BlogStack
        ├── BlogScreen
        ├── BlogDraftScreen  (placeholder)
        └── BlogPublishedScreen  (placeholder)
```

**Tab bar labels:** Home · Explore · Search · Blog

> [!IMPORTANT]
> **Correction to existing plan:** `2026-05-06-phase-1-scaffold-auth.md` defines four tabs as `Home · Destinations · Search · Blog`. This is outdated. Per the approved design spec, the four tabs are **Home · Explore · Search · Blog**. Destinations is a secondary screen accessible from Home and Trip Detail — not a primary tab. The execution plan must be updated before running.

---

## FloatingCaptureButton

A global overlay component rendered at the `MainNavigator` level — outside any individual tab stack. This ensures the button appears on every screen in the authenticated app without each screen needing to manage it.

**Positioning:** Fixed position above the tab bar. Amber (`#C8703A`) circular button with a mic/pen icon. Tapping it opens the `NoteCaptureSheet` (a bottom sheet modal, implemented in Module 3 — placeholder here).

**Render strategy:** Rendered as an absolutely positioned view within the MainNavigator wrapper, not inside any stack. The bottom tab bar height is calculated to position the button just above it.

---

## Placeholder Screens

All screens beyond Auth are placeholders in this module. Each renders the screen name and nothing else. They are filled in by their respective modules:

| Screen | Filled by module |
|---|---|
| HomeScreen | 2 — Trip Management |
| TripDetailScreen | 3 — Note Capture (Feed), 7 — Maps (Map tab) |
| ExploreScreen | 10 — Community & Explore |
| DestinationPage | 10 — Community & Explore |
| PublishedPostView | 10 — Community & Explore |
| SearchScreen | 8 — Semantic Search |
| BlogScreen | 9 — Blog Generation |
| BlogDraftScreen | 9 — Blog Generation |
| BlogPublishedScreen | 9 — Blog Generation |
| NoteCaptureSheet | 3 — Note Capture |

---

## File Structure

```
src/
  contexts/
    AuthContext.tsx
  navigation/
    AppNavigator.tsx
    PublicNavigator.tsx
    MainNavigator.tsx
    types.ts                  ← all param list types for every stack
  screens/
    auth/
      LoginScreen.tsx
      SignupScreen.tsx
      DisplayNameScreen.tsx   ← post-signup display name capture
    HomeScreen.tsx            ← placeholder
    TripDetailScreen.tsx      ← placeholder
    ExploreScreen.tsx         ← placeholder
    SearchScreen.tsx          ← placeholder
    BlogScreen.tsx            ← placeholder
  components/
    FloatingCaptureButton.tsx ← stub (opens nothing yet; implemented in Module 3)
App.tsx
```

---

## Key Decisions

| Decision | Choice | Reason |
|---|---|---|
| Default landing (unauthenticated) | Explore | Value before commitment; community content is the hook |
| Auth gates | AppNavigator only | No per-screen auth checks; clean separation |
| FloatingCaptureButton level | MainNavigator (not per-screen) | Truly global; no duplication; tab switching doesn't re-mount it |
| Tab structure | Home · Explore · Search · Blog | Matches approved design spec; Destinations is not a tab |
| Display name | Separate post-signup screen | Keeps signup friction minimal; name collected before first action |
| Session persistence | AsyncStorage | Standard Expo/Supabase approach; survives app restarts |
| Profile check | AuthContext loads profile on session start | Avoids screen-level profile fetches; centralizes state |
