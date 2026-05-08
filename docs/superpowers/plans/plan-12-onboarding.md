# Module 12 — Onboarding
**App:** Into Your Stories
**Status:** Design doc — pending approval before execution
**Depends on:** Module 1 (AppNavigator), Module 2 (HomeScreen), Module 9 (StyleOnboardingScreen), Module 10 (ExploreScreen)

---

## Purpose

Polish the new user experience end-to-end. New users land on Explore (value before commitment), move through a frictionless signup, enter their display name, optionally set a writing style, and land on Home ready to start their first trip. Empty states across all tabs give clear next-step guidance.

This module is last because it depends on all the screens it references being real (not placeholders). It's a polish + wiring pass, not a feature-from-scratch pass.

---

## AppNavigator Routing (Finalized)

Module 1 established the routing skeleton. This module finalizes the logic:

```
App starts
  → AuthContext loads (session check)
  → loading = true → SplashScreen (logo + background color)
  → loading = false:
      → No session → PublicNavigator (default: ExploreScreen)
      → Session exists, no display_name set → DisplayNameScreen (forced — cannot skip)
      → Session exists, display_name set → MainNavigator (default tab: Home)
```

The display name check happens in AuthContext when it loads the user's `profiles` row. If `display_name` is null, the app routes to `DisplayNameScreen` regardless of which tab the user was on.

---

## PublicNavigator: Unauthenticated Explore

Unauthenticated users see the full Explore tab — destination grid, recently published strip, destination pages, and full published post views. No login wall.

**Persistent CTA elements visible to unauthenticated users:**
- A sticky banner at the bottom of ExploreScreen (above the would-be tab bar): "Start capturing your stories → [Sign Up]" — amber button
- At the bottom of every PublishedPostView: the acquisition CTA ("Capture your own stories →") with a Sign Up button
- No tab bar visible to unauthenticated users — they have no tabs to navigate; the experience is Explore-only

**Login/Signup access:**
- "Sign Up" buttons navigate to SignupScreen
- "Already have an account? Sign in" link on SignupScreen navigates to LoginScreen
- After successful login/signup → AppNavigator re-evaluates → routes to DisplayNameScreen or MainNavigator

---

## Post-Signup Flow

After Supabase signup confirmation and first login:

### Step 1: DisplayNameScreen (required)
- Prompt: "What should we call you?"
- Single text field: display name (real name or handle — user's choice)
- Helper text: "This is how you'll appear as an author on published stories."
- "Continue" button — disabled until at least 2 characters entered
- Saves display name to `profiles.display_name`
- Cannot skip

### Step 2: StyleOnboardingPromptScreen (optional offer)
- Shown immediately after display name save
- Prompt: "Want Claude to write in your voice?"
- Two options side by side:
  - **"Add my style"** → navigates to StyleOnboardingScreen (Module 9)
  - **"Skip for now"** → navigates to HomeScreen
- Helper text: "Paste up to 5 blog posts and Claude will match your writing style. You can always do this later from the Blog tab."
- Skipping is fine — style builds passively from published posts over time

### Step 3: HomeScreen (empty state)
User arrives at Home with no trips. See Empty States below.

---

## "Start your first trip" Banner

Shown in `MainNavigator` to authenticated users who have zero trips (checked via `useTrips` hook count).

- Rendered as a persistent banner just above the tab bar — not inside any specific tab
- Text: "Ready for your next adventure? [Start a trip →]"
- Tapping opens `CreateTripSheet`
- Dismissed permanently once the user creates their first trip (stored in a local AsyncStorage flag — no need to query the server)
- Not shown after first trip exists

---

## Empty States

All empty states use the shared `EmptyState` component (built in Module 2). Each screen gets a tailored message and CTA:

| Screen | Empty condition | Message | CTA |
|---|---|---|---|
| HomeScreen | No trips | "Your trips will appear here." | "Start your first trip" → CreateTripSheet |
| TripFeedScreen | No notes in trip | "No notes yet. Capture your first memory." | Highlights FloatingCaptureButton with a pulse animation |
| TripMapScreen | No places in trip | "Places appear here as you add notes with locations." | None (informational only) |
| SearchScreen | No results | "No results. Try different words." | None |
| BlogScreen | No drafts or posts | "Your stories will appear here. End a trip to get started." | None (informational only) |
| ExploreScreen | No published posts | "Be the first to share a story." | "Start a trip" → if authenticated; "Sign up" → if not |
| DestinationsScreen | No places | "Your personal travel history appears here." | None |

---

## File Structure

```
src/
  screens/
    auth/
      DisplayNameScreen.tsx           ← post-signup required step
      StyleOnboardingPromptScreen.tsx ← optional offer after display name
  components/
    NewUserBanner.tsx                 ← "Start your first trip" persistent banner
    EmptyState.tsx                    ← update: tailored messages for each screen
  navigation/
    AppNavigator.tsx                  ← finalize routing logic (auth + profile check)
```

---

## Key Decisions

| Decision | Choice | Reason |
|---|---|---|
| Default landing (unauthenticated) | Explore | Value before commitment; community content is the hook |
| Display name | Required, forced post-signup | Community platform needs author identity from day 1 |
| Style onboarding | Optional offer, not required | Never block the user; style builds passively anyway |
| Tab bar | Hidden for unauthenticated | No tabs to show; Explore is the entire unauthenticated experience |
| "Start your first trip" banner | Dismissed on first trip create | Not a nag; a one-time orientation prompt |
| Banner dismissal | AsyncStorage flag | Avoids a server round-trip; device-local preference |
| Empty state CTA for Feed | Pulse animation on FloatingCaptureButton | Teaches the gesture without being prescriptive |
