# Notebound — Test Market Strategy

**Created:** 2026-08-07
**Goal:** Put Notebound in the hands of a small group of friends, on their real
travels, without leaking their data or burning their trips on a broken build.

Companion to `2026-08-07-app-store-release.md` (the mechanical release checklist).
That doc is *how to ship*. This one is *how to test*, plus the security and
privacy work that has to land before anyone else's photos are in the database.

---

## 0. The one insight that shapes everything

**Test-user trips are non-renewable.** Every other kind of beta lets a tester
retry tomorrow. This app is only exercised on a real trip — real GPS drift, real
offline gaps, real hotel wifi, real 400-photo days. If your build is broken while
your friend is in Lisbon, you don't get that trip back. You cannot ask them to fly
somewhere again.

So the strategy is **staggered by trips, not by calendar**: never expose more
travellers to an unproven build than you can afford to lose, and always keep
untapped testers in reserve for the build after the next fix.

---

## 1. Security and privacy — findings from the 2026-08-07 audit

I audited RLS policies, storage rules, edge functions, and secret handling. Three
real problems, one of them serious. All predate this session; none are theoretical.

### 🔴 CRITICAL — Anyone on the internet can enumerate and download every user's photos

Migration `007` grants:

```sql
CREATE POLICY "photos: public read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'photos');
```

`TO public` with an unqualified `USING (true)`-equivalent means **unauthenticated**
read on every object in the bucket. Photos are served via `getPublicUrl`
(`photoService.ts:33`), so the URLs carry no token and never expire.

This is not merely "unguessable URLs are exposed." Because SELECT on
`storage.objects` is what backs the **list** API, anyone holding the anon key can
call `storage.from('photos').list()` and walk the bucket: root listing returns
every user's UUID folder, then each folder yields note IDs, then filenames. The
anon key ships inside the IPA and is extractable in minutes — it is designed to be
public, which is exactly why it must never be the only thing standing between a
stranger and your users' data.

**It chains with the next finding into a full deanonymization.**

**Fix (before any tester uploads a photo):**
1. New migration: drop the public SELECT policy, replace with owner-scoped
   `(storage.foldername(name))[1] = auth.uid()::text`, matching the INSERT/UPDATE/
   DELETE policies already there.
2. Flip the bucket to private in the Supabase dashboard.
3. `getPublicUrl` → `createSignedUrl` with a TTL.
4. **Design consequence to handle:** `generate-blog` embeds *original photo URLs*
   inside stored blog content. Signed URLs expire, so stored blogs would rot.
   Store **storage paths** in blog content and sign at render time. This is the
   real work in the fix — the policy change itself is four lines.
5. `generate-blog` fetches photos server-side; it holds the service role, so it
   can read directly or self-sign. No functional loss.

### 🔴 HIGH — The entire profiles table is world-readable

Migration `002`:

```sql
create policy "profiles_select_all"
  on public.profiles for select
  using (true);
```

No `TO authenticated` clause, so this grants the **anon** role too. Anyone with
the anon key can dump every row: user UUID, `display_name` (your testers' real
names, as typed at signup), and signup timestamp.

Combined with the storage finding: **dump profiles → get UUID + real name → list
that UUID's photo folder → download that named person's travel photos.** Two
independently-minor policies compose into a targeted privacy breach.

The code comment says the policy is "needed on published posts later" — but public
blogs are V2, and V1 blogs are explicitly 100% private. It's a policy written for
a feature that doesn't exist yet.

**Fix:** scope to `to authenticated` at minimum; for V1, own-row-only
(`auth.uid() = id`) is correct, since nothing renders another user's display name.

### 🟡 MEDIUM — Two edge functions only check that an auth header *exists*

`tag-note` and `detect-intent` both do:

```ts
const authHeader = req.headers.get('Authorization');
if (!authHeader) return 401;
```

They never validate it. `Authorization: Bearer hello` passes. Today this is
covered by Supabase's gateway-level `verify_jwt`, which is on by default — so the
functions are safe *only because of a platform setting neither function asserts*.
If either is ever redeployed with `--no-verify-jwt`, they become an open,
unauthenticated proxy to your Anthropic key that anyone can bill to your card.

**Fix:** verify `verify_jwt: true` on all three functions in the dashboard, and
add real token verification inside `tag-note` and `detect-intent` — `generate-blog`
already does this properly (`admin.auth.getUser(token)` plus a trip-ownership
check at `index.ts:383`, which is exactly right and worth copying).

### ✅ What's already correct

Worth stating, because it's most of the surface:

- `notes`, `trips`, `blog_posts` RLS is own-rows-only, and migration `013`
  specifically closed a cross-trip move hole in the UPDATE policy.
- `generate-blog` verifies the JWT *and* trip ownership before reading notes —
  no IDOR.
- `.env` has never been committed (checked the full history).
- Only `EXPO_PUBLIC_*` vars are inlined into the bundle, so
  `SUPABASE_SERVICE_ROLE_KEY` sitting in `.env` is **not** shipped to devices.
- `photoService` re-encodes every upload to JPEG via `manipulateAsync`, which
  **strips EXIF** — uploaded photos carry no embedded GPS. (Coordinates still
  live in the `notes` row, correctly RLS-protected.)
- The community aggregate is genuinely anonymized: no identity, no timestamps.

### 🔒 The disclosure you owe your testers

You hold the service role key. **You can read every note, photo, and blog your
friends create.** That is normal for any app operator, and it is also not what a
friend assumes when you hand them a travel journal.

Tell them in plain words before they install, and put it in the privacy policy.
"I can technically see your data, I won't go looking, and here's how to delete all
of it" is a thirty-second conversation that prevents a genuinely bad moment later.

### Ongoing security practice

- Run Supabase **advisors** (`get_advisors`, security lint) before every release —
  it catches missing RLS on new tables, which is how both findings above happened.
- **Rotate the service role key** if it's ever pasted anywhere shared.
- Never add a table without an RLS policy in the same migration. Both findings
  above are "policy written optimistically for a future feature."
- Add a security review step to the release checklist, not to a someday list.

---

## 2. What has to be true before testers get a build

Ordered by whether it blocks.

### Blocking — security (me, ~1–2 days) — **code complete 2026-08-07**
- [x] Lock down the photos bucket + migrate blog content to storage paths + signed URLs.
- [x] Scope the profiles SELECT policy.
- [x] Real JWT verification in `tag-note` and `detect-intent`.
- [ ] **Apply migration `025_security_lockdown.sql`** and redeploy the three edge functions.
- [ ] Confirm `verify_jwt` on all three in the dashboard (no longer load-bearing, but confirm).

See `docs/progress.md` → "Security Lockdown" for what changed and why. 362 tests green, tsc clean.

### Blocking — App Store review (me, ~2–3 days)
- [ ] Settings screen (sign-out moves here, version string, policy links).
- [ ] **Account deletion** — edge function w/ service role, full cascade, confirm dialog. Guideline 5.1.1(v).
- [ ] Hide Explore from `TAB_CONFIG` (decided 2026-08-07 — removes the Guideline 1.2 UGC problem).
- [ ] `ITSAppUsesNonExemptEncryption: false` in `app.json`.

### Blocking — you
- [ ] Apple Developer Program enrollment (Individual). **Start first — 24–48h, gates everything.**
- [ ] Privacy policy + support pages on rutvijdhotey.com.
- [ ] App icon + splash PNGs (1024×1024, **no alpha**). You convert assets; I'll wire them.
- [ ] Supabase: upgrade to Pro, fix the Site URL, fix the reset-password email template.

### Strongly recommended, not blocking
- [ ] Crash reporting (Sentry free tier). Without it every report is "it crashed."
- [ ] Per-user daily cap on `generate-blog` + an Anthropic spend alert.
- [ ] Onboarding — testers currently meet four permission prompts with no context.
- [ ] Finish `feature/forgot-password`. A tester who forgets their password on day 3 abroad is simply lost without it.

---

## 3. Cost

### One-time / annual
| Item | Cost |
|---|---|
| Apple Developer Program | **$99/year** |
| Domain (rutvijdhotey.com) | already owned |

### Monthly during testing
| Item | Cost | Notes |
|---|---|---|
| Supabase Pro | **$25/mo** | Confirm current tier limits before relying on specific quotas |
| Anthropic API | **~$5–15/mo** | See below |
| Sentry | **$0** | Free tier is ample at this scale |
| EAS Build | **$0** | Free tier covers this cadence; paid only if you want faster queues |

### Anthropic estimate for 10 testers/month
- `tag-note` (Haiku, tiny prompts): ~$0.001/note → 10 testers × 50 notes ≈ **$0.50**
- `detect-intent` (Haiku, one word out): negligible → **<$0.10**
- `generate-blog` (Opus + vision, the real cost): **$0.12–0.65/blog** per your own
  measurements → 10 testers × 2 blogs ≈ **$2.50–13**

**~$5–15/month**, dominated entirely by blog generation. The risk isn't the
average, it's the absence of a limit: one tester regenerating a 68-photo blog
twenty times is a $13 afternoon. Cap it per user per day.

### Bottom line
**~$40–50/month during testing, plus $99 once.** A three-month beta lands around
**$220–250 total.** This is not a project where infrastructure cost is a real
constraint — spend the $25 on Supabase Pro without agonizing.

---

## 4. How many testers, and in what order

**Recommendation: 5 in the first real wave. 10–12 total. Never all at once.**

### Wave 0 — you, one real trip (before anyone else)
You are tester #1 and it isn't optional. Take the TestFlight build (not a dev
build) on one real trip, start to finish: create the trip, capture across several
days, go offline, come back, generate the blog. Every bug you find here is one you
don't spend a friend's trip discovering.

### Wave 1 — 3–5 friends, staggered by departure date
Pick people whose trips are **at least two weeks out**, so a bug found by the
first traveller can be fixed before the second one leaves. Prioritize:
- At least one person on a **multi-city, week-plus** trip — that's where trip-aware
  location inference, the itinerary generator, and the blog actually get exercised.
- At least one person who is **not technical** — they'll hit the onboarding cliff
  you can no longer see.
- At least one **heavy photographer** — that's where storage, upload queueing, and
  vision costs show up.
- Ideally one **international** traveller — offline gaps, roaming, timezone
  handling in `occurred_at`.

Why 5: with no crash reporting on day one and one maintainer working evenings,
5 concurrent travellers already produce more inbound than you can triage. Bugs
arrive in bursts, timezone-shifted, and are usually unreproducible on your desk.

### Wave 2 — expand to 10–12 once wave 1 completes a trip cleanly
Add remaining friends after at least one wave-1 tester finishes a full trip →
blog cycle without a blocking bug.

### Ceiling
Don't exceed ~12 for the friends-and-family phase. TestFlight allows 10,000
external testers; your evenings do not. Past a dozen you stop reading feedback
carefully, which defeats the point.

---

## 5. Running the beta

### Before they install
- **A one-page "what this is" note.** What the app does, what's known-broken, what
  you want feedback on, how to reach you, and the data-access disclosure from §1.
- **Set the trip expectation explicitly:** "capture notes as you go, and generate
  the blog at the end." Without this, half your testers will open it once at the
  airport and never again — and you'll learn nothing.
- **Known-issues list.** Prevents five people reporting the same thing and lets
  them report the interesting thing instead.

### Feedback channel
- TestFlight's built-in screenshot feedback is good and routes to App Store
  Connect. Tell them it exists — nobody knows about the screenshot gesture.
- Add one **group chat**. Most real feedback is a half-sentence someone won't file
  formally. Keep bug triage in the chat, keep the actual backlog in the repo.
- **Ask for the trip, not just the bug.** "It crashed" is unactionable; "it crashed
  when I added the 4th photo on the train with no signal" is a fix.

### While they travel
- **Watch Sentry and Supabase logs daily.** Testers under-report — they're on
  holiday and will work around a bug rather than tell you.
- **Have a hotfix path ready.** EAS build → TestFlight is roughly 30–60 minutes to
  distribution. Know that before you need it at 11pm.
- **Don't ship a risky build mid-trip.** If someone is abroad and working, leave
  them alone. A tester on a working build is producing data; a tester on a broken
  one is producing resentment.

### After each trip
- A 20-minute call beats any survey. Ask them to walk through their trip in the
  app while you watch. You will learn more in those 20 minutes than from a month
  of chat messages.
- Specifically ask: *did you actually publish or share the blog?* That's the real
  product question. Capture is the feature; the blog is the point.

### Data safety
- Supabase Pro includes automated backups — confirm they're on before wave 1.
  Losing a friend's trip notes costs more than a bug does.

---

## 6. Plan of action

**Week 1 — unblock and secure**
- *You:* Apple enrollment. Supabase Pro. Fix Site URL + reset-password template.
- *Me:* the three security fixes (§1). This is the top of my queue — it lands
  before anyone else's data exists.

**Week 2 — required code**
- *Me:* Settings screen + account deletion (spec → plan → build). Hide Explore.
  Encryption flag. Sentry. Blog-generation rate cap.
- *You:* privacy policy + support pages. Icon + splash assets.

**Week 3 — store setup and first build**
- *You:* App Store Connect listing, App Privacy questionnaire, screenshots.
- *Me:* `eas init`, production build, seeded demo account for review, submit for
  Beta App Review.

**Week 4 — Wave 0**
- *You:* take it on a real trip. Fix list comes back from that.

**Weeks 5–8 — Wave 1**, staggered by departure dates.

**Weeks 9–12 — Wave 2**, then decide on public launch.

Roughly **3 weeks to a TestFlight build**, gated mostly on Apple enrollment and
the security work — call it a month to real testers, allowing for slippage.

---

## 7. Other recommendations

- **Ship the forgot-password flow before wave 1.** It's already built; it needs
  one dashboard change and a manual test. A locked-out tester abroad is a dead
  tester.
- **Seed the review account with a full trip** — notes, photos, a generated blog.
  Reviewers reject apps that look empty, and a login-walled app with no demo data
  looks broken.
- **Instrument the funnel, minimally.** Trips created → notes captured → blogs
  generated. You need to know *where* people stop, not just whether they liked it.
- **Write down what "success" means before wave 1.** Something like: 3 of 5
  testers complete a trip and generate a blog they'd actually show someone. Decide
  it now, while it's still a hypothesis rather than a rationalization.
- **Keep it iOS-only.** `android/` exists, but Play Store is a whole second
  release track. Don't split focus at 10 users.
- **TestFlight builds expire after 90 days.** A long beta needs a refresh build.
- **Set a decision date.** Betas drift indefinitely without one. Pick the date now
  when you'll decide: public launch, keep iterating, or shelve it.
