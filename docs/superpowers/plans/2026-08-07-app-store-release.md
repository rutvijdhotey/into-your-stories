# App Store Release Plan — Notebound

**Created:** 2026-08-07
**Goal:** Get Notebound from "V1 feature-complete on a laptop" to "installed on real users' iPhones via the App Store."

This is a release plan, not a feature plan. Most steps are account admin, store
metadata, and compliance; only Phase 2 is code. Phases 0–2 can run in parallel —
Phase 0 has multi-day lead time, so start it first.

**Current state (verified 2026-08-07):** 322 tests / 37 suites pass, `tsc --noEmit`
clean. V1 feature backlog complete. `ios/` regenerated 2026-07-31 with bundle ID
`com.rutvijdhotey.intoyourstories` and product name Notebound.

---

## Phase 0 — Accounts and prerequisites (no code; start today)

- [ ] **Enroll in the Apple Developer Program** — $99/yr. Choose **Individual**,
      not Organization: Organization requires a D-U-N-S number and can take weeks.
      Individual approval is typically 24–48h. Caveat: with an Individual account
      your **legal name is shown publicly as the seller** on the App Store listing.
      Nothing else in this plan can complete until this is approved.

- [ ] **Reserve the app name** in App Store Connect. "Notebound" may already be
      taken — names are globally unique and first-come. Have a fallback ready
      (e.g. "Notebound: Travel Journal"). The **subtitle** is separate and is where
      the keywords go.

- [ ] **Do NOT change the bundle ID.** `com.rutvijdhotey.intoyourstories` is
      internal and never shown to users. It is also **permanent after first
      submission**. The Into-Your-Stories/Notebound mismatch is cosmetic and
      invisible; changing it now costs a prebuild + a fresh device install for
      zero user-visible benefit.

- [ ] **Publish a privacy policy** at a public URL. Required field in App Store
      Connect — the listing cannot be submitted without it. Host it on
      rutvijdhotey.com (already a Next.js static export on GitHub Pages).
      It must disclose: email (accounts), precise + coarse location, photo library
      access, microphone/speech, and **that note text and photos are sent to
      Anthropic** for blog generation and auto-tagging.

- [ ] **Publish a support URL** — also a required field. A simple contact page or
      a mailto: landing section on the same site is sufficient.

---

## Phase 1 — Decide the community-content posture (blocking design call)

The Explore tab publishes `public_places.place_name` — **user-typed free text
visible to other users** — and the 2026-06-21 model explicitly deferred moderation
to V2.

**This collides with App Store Guideline 1.2 (User-Generated Content)**, which
requires apps with UGC to provide: a content filter, a way for users to report
offensive content, a way to block abusive users, and published contact info.
Shipping the community map with zero moderation is a plausible rejection.

Pick one before building Phase 2:

- **Option A — Ship Explore, add minimal moderation.** A report button on
  `PublicPlaceRow`, a `reports` table, and a profanity/denylist filter at
  aggregation time in `aggregate_trip_for_community`. Smallest honest path to
  compliance. ~1–2 days of work.
- **Option B — Hide Explore for v1.0.** Remove the tab from `TAB_CONFIG`, keep the
  data layer accruing silently, ship as a purely private journal. Zero UGC surface
  means Guideline 1.2 doesn't apply. Ship in days, re-enable in 1.1 with
  moderation built properly.
- **Option C — Constrain to a validated place set.** Only publish names resolved
  by the geocoder, never manual text. Loses the AI venue-name precedence work
  from 3.5.

**Recommendation: Option B for v1.0.** The community map has near-zero value at
launch anyway — it's empty until strangers complete trips. Ship the private
journal, get real users, add Explore with real moderation in 1.1.

---

## Phase 2 — Code required for review

### 2a. Settings screen (new surface)

Nothing in the app has a settings surface today; sign-out is an inline link on
`HomeScreen.tsx:137`. Create one screen to hold everything below:

- [ ] Move sign-out here from `HomeScreen`.
- [ ] Community contribution toggle (see 2b).
- [ ] Delete account (see 2c).
- [ ] Privacy policy + support links.
- [ ] App version string (helps every future bug report from testers).

### 2b. Community opt-out toggle — wire up the orphaned column

Migration `019_profiles_contribute_optout.sql` added
`profiles.contribute_to_community boolean not null default true`. It is present in
`database.types.ts` and **read/written by nothing in `src/`**. Right now every
user contributes by default with no way to decline — which contradicts the
"global opt-out, default ON" decision and weakens the App Privacy answers.

- [ ] Read + write the flag from Settings.
- [ ] Confirm the aggregation trigger honors it (it was built to — verify live).

*Skip if Phase 1 lands on Option B, but note it becomes blocking again in 1.1.*

### 2c. Account deletion — **hard blocker, Guideline 5.1.1(v)**

Any app offering account creation must offer in-app account deletion. There is no
delete path today. This is a straight rejection at review.

Deleting a Supabase auth user requires the `service_role` key, which must never
ship in the client bundle. So:

- [ ] New Edge Function `delete-account` (`verify_jwt: true`), service role from
      function secrets, deriving the user ID from the JWT — never from the request
      body.
- [ ] Cascade in order: storage photos under `{userId}/**` → `notes` →
      `blog_posts` → `trips` → `public_place_contributions` → `profiles` →
      `auth.admin.deleteUser`.
- [ ] **Decide the community-aggregate question:** `public_place_contributions`
      carries `user_id` and must be deleted. Whether the corresponding
      `public_places` counts get decremented is a real choice — decrementing is
      more honest, leaving them keeps the aggregate stable. Recommend decrement,
      since the ledger is the audit trail that makes it reversible.
- [ ] Client: confirm dialog with typed confirmation, call function, sign out.

This one deserves its own spec → plan cycle. It is destructive, irreversible, and
touches every table.

### 2d. Pre-answer export compliance

- [ ] Add `ITSAppUsesNonExemptEncryption: false` to `app.json` `ios.infoPlist`.
      The app only uses standard HTTPS, which is exempt. Without this you get
      prompted on **every single build upload**.

---

## Phase 3 — Infrastructure hardening (before real users, not after)

- [ ] **Upgrade Supabase to Pro ($25/mo).** Two independent reasons:
      1. **Free tier auto-pauses after ~7 days of inactivity.** If it pauses
         during App Review, the reviewer sees a dead app and you get rejected.
      2. Free tier caps (1GB storage / 5GB egress) will not survive real users
         uploading 3 photos per note at 1200px.
      Also unlocks Image Transformations, which the 2026-06-05 work had to revert.

- [ ] **Cap Anthropic spend.** `generate-blog` runs a multimodal Opus pass at an
      estimated **$0.12–0.65 per blog**, with no per-user rate limit. A handful of
      enthusiastic testers can run up a real bill. Add a per-user daily generation
      cap and set a spend alert on the Anthropic account.

- [ ] **Add crash reporting (Sentry).** Without it, every tester report is "it
      crashed" with nothing actionable. Cheapest possible insurance before the app
      is on hardware you don't own.

---

## Phase 4 — Store assets and metadata

- [ ] **App icon** 1024×1024 PNG, **no alpha channel, no transparency** (Apple
      rejects both). Current `assets/icon.png` is still the Expo default.
- [ ] **Splash** — also still the Expo default.
- [ ] **Screenshots** — 3–10 per required device size. Confirm the current
      requirement in App Store Connect (Apple has consolidated toward a single
      6.9" iPhone size). Best shots: a trip feed with photos, the trip map, a
      generated blog post, the itinerary view.
- [ ] **Listing copy** — subtitle, description, keywords, promo text.
      Category: **Travel**. This is a good use of the writing-style memory.
- [ ] **Age rating questionnaire.** Answer honestly re: user-generated content —
      the answer depends on the Phase 1 decision.
- [ ] **App Privacy questionnaire** — the most tedious item, and the one most
      often filled in wrong. Declare: Contact Info (email), Location (precise +
      coarse), User Content (photos, notes, audio transcripts), Identifiers.
      Declare that content goes to a third-party processor (Anthropic). Must match
      the privacy policy exactly.

---

## Phase 5 — Build and TestFlight

- [ ] `eas init` — `eas.json` already has dev/preview/production profiles, but
      `app.json` has no `extra.eas.projectId`, so the repo isn't linked yet.
- [ ] `eas build --profile production --platform ios`. `autoIncrement: true` and
      `appVersionSource: "remote"` are already configured, so build numbers come
      from EAS. Prefer EAS over a local Xcode archive — it manages the
      distribution certificate and provisioning profile for you.
- [ ] `eas submit` → TestFlight.
- [ ] **Provide a demo account** in App Review Information. The app is entirely
      behind a login wall; reviewers **will** reject if they can't get in. Create a
      dedicated review account **seeded with a completed trip, notes, photos, and a
      generated blog** — an empty account makes the app look broken.
- [ ] **Choose the tester track:**
      - *Internal* — ≤100 testers, each needs an App Store Connect seat, **no Beta
        App Review**, builds available in minutes.
      - *External* — ≤10,000 testers, shareable public link, requires **Beta App
        Review** (~24–48h the first time).
      Recommend **external**: the public link is far easier than granting seats,
      and the review forces the compliance work you need for release anyway.
- [ ] Run a real beta: 5–10 people, 1–2 weeks. Ideally at least one tester
      actually travelling — this app is trip-shaped and bugs will only surface on
      a real trip with real GPS drift and real offline gaps.

---

## Phase 6 — Production submission

- [ ] Submit for App Review (typically 24–48h).
- [ ] Enable **phased release** — 7-day gradual rollout, pausable if crash reports
      spike.
- [ ] Watch Sentry and Supabase logs for the first week.

---

## Critical path

The genuinely blocking chain is:

**Apple Developer enrollment** → **account deletion (2c)** → **demo account** →
**build + upload** → **Beta App Review** → testers.

Everything else parallelizes. The single highest-leverage thing to do today is
start Apple enrollment, because it is pure waiting and it gates everything.

## Open questions for the user

1. Phase 1: Option A, B, or C on the community map?
2. Individual or Organization Apple account?
3. Are you willing to move Supabase to Pro before launch?
4. Target date — is there a trip coming up that would make a good beta?
