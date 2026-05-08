# Module 9 — Blog Generation
**App:** Into Your Stories
**Status:** Design doc — pending approval before execution
**Depends on:** Module 0 (blog_posts, style_profiles schema), Module 2 (trips), Module 5 (photo_descriptions), Module 6 (places), Module 8 (embedding on publish)

---

## Purpose

Turn a completed trip into a polished blog post. Claude reads all the trip's notes, photos, and metadata; drafts a narrative in the user's writing style; and delivers it as a push notification when ready. The draft is read-only — publish or discard.

After this module: the Blog tab is functional. Users can generate drafts, preview them, publish to a real web URL, or discard. Publishing populates the community destination map (Module 10 reads from it).

---

## Blog Lifecycle

```
Trip completed
  → User taps "Generate Blog" on TripDetailScreen
  → Blog post row created: status = 'generating'
  → Edge Function invoked (async)
  → User can leave the screen — generation continues in background
  → Edge Function completes:
      → status updated to 'draft'
      → Push notification sent
  → User opens Blog tab → sees new draft
  → Reads draft (read-only)
  → Publishes or discards
```

---

## Style Onboarding

Optional. Accessible from Blog tab and from post-signup flow (Module 12).

**What it does:** User uploads or pastes up to 5 existing blog posts. Claude analyzes them and produces a structured style profile stored in `style_profiles`:
- Tone (formal, conversational, lyrical, journalistic, etc.)
- Sentence structure tendencies
- How the author describes food vs. places vs. experiences
- Typical post length
- Recurring stylistic markers

If skipped: Claude uses a "clear, engaging travel writing" default. After the user's first post is published, it becomes their first style reference. The profile builds passively from their own posts over time — zero friction path to personalization.

---

## Edge Function: `generate-blog`

Runs server-side (Supabase Edge Function, Deno runtime). Uses service role key — has full DB access, not constrained by user RLS.

**Inputs:**
- `trip_id`, `user_id`

**Steps Claude executes (in order):**

1. **Gather context:** Load all notes for the trip (content, category, place_name, city, lat, lng, created_at) + all photo_descriptions + all places
2. **Load style profile:** Fetch from `style_profiles` if exists; use default otherwise
3. **Content moderation check:** Pass all note content through a lightweight Claude check. If clearly inappropriate content detected → set `moderation_flagged = true`, set status to `draft` with a flag, send push notification — user sees a moderation warning banner on the draft, no auto-discard
4. **Photo selection:** Claude selects a representative set of photos based on semantic descriptions. Target: ~8–12 photos for a week-long trip (scales with trip length). Cover photo selected separately — most visually descriptive photo that works as a hero. These are stored as `selected_photo_urls` and `cover_photo_url` on the `blog_posts` row.
5. **Draft generation:** Claude writes:
   - Title
   - Intro paragraph
   - Narrative sections — organized by city or day depending on data richness
   - Photos placed contextually within the narrative (using Markdown image syntax with Supabase Storage URLs)
   - Structured Places summary (all Places from the trip, grouped by category)
   - Closing paragraph
6. **Itinerary data check:** If sufficient timestamp + GPS data exists (at least 3 days with timestamped + geolocated notes), Claude produces a day-by-day itinerary as a separate structured block. Otherwise this block is omitted — itinerary tab on the published post is conditional.
7. **Store draft:** Insert/update `blog_posts` row with full `content_markdown`, `title`, `selected_photo_urls`, `cover_photo_url`, itinerary block, `status = 'draft'`.
8. **Send push:** Call `send-push` Edge Function with the user's `push_token`.

**Error handling:** If the Edge Function fails at any step, the `blog_posts` row status remains `generating`. The app polls for status change (or listens via Realtime). If still `generating` after 5 minutes, a retry button appears in the Blog tab. No silent failures.

---

## Blog Tab (BlogScreen)

The Blog tab. Shows the user's own drafts and published posts.

**Layout:**
- "Drafts" section (top): cards for each unreviewed draft — cover photo, trip name, generated date, "Ready to review" label
- "Published" section: cards for each published post — cover photo, title, published date, web URL label
- Empty state (no drafts, no published): "Your stories will appear here. End a trip to generate your first post."

---

## BlogDraftScreen

Read-only preview of the generated draft.

**Layout:**
- Full-bleed hero image (cover photo)
- Title
- Rendered Markdown narrative with inline photos
- Structured Places summary (same component as published post — `PlacesSummary`)
- Mini-map (`MiniMap`) — all Place pins for the trip, using `react-native-maps` same as Module 7
- Itinerary section — rendered if present; hidden if Claude omitted it
- Moderation warning banner — shown if `moderation_flagged = true`

**Actions:**
- **Photo override:** A "Change photos" button opens a photo selection screen showing all trip photos; user can deselect Claude's choices and select different ones. Changes saved to `selected_photo_urls`. Cover photo also swappable. (This is the only user edit allowed in V1.)
- **Publish** — primary CTA (amber button)
- **Discard** — secondary destructive action (confirmation alert before discarding)

---

## Publish Flow

Tapping Publish triggers:
1. Photos in `selected_photo_urls` copied from `photos/` bucket to `blog-assets/` bucket (makes them publicly accessible)
2. `blog_posts` status updated to `published`, `published_at` set, `web_slug` generated (if not already)
3. Post's `content_markdown` embedded via Cohere → stored in `embeddings` (Module 8)
4. All `places` rows for the trip inserted into `community_destinations` for their respective cities (populates Explore — Module 10)
5. App displays a "Published!" confirmation moment with the web URL and a Share button

---

## Web URL

Format: `https://[domain]/stories/[web_slug]`

`web_slug` is generated at publish time: `{trip-name-slugified}-{short-random-id}` (e.g., `japan-2024-abc123`). Stored on the `blog_posts` row. The web layer (Module 11) serves this URL.

---

## Export

From BlogPublishedScreen, users can export their post as:
- **Markdown** — raw `content_markdown` from the database
- **HTML** — rendered Markdown converted to HTML

Delivered via the native iOS Share Sheet.

---

## BlogPublishedScreen

In-app view of a published post. Identical to what Module 10's `PublishedPostView` renders for community viewers — same component, same data, same layout. The difference is a settings menu (top-right) accessible only to the author with: "Unpublish" and "Export."

**Unpublish flow:** Status set to `draft`. Embedding deleted from `embeddings`. All `community_destinations` rows for this post deleted. Post disappears from Explore.

---

## Push Notifications

Uses `expo-notifications`. Expo push token stored on the `blog_posts` row at generation request time (not on the user profile — tokens can rotate).

Notification payload:
- Title: "Your story is ready ✨"
- Body: "{Trip name} — tap to read your draft"
- Deep link: opens BlogDraftScreen for the post

---

## File Structure

```
src/
  screens/
    BlogScreen.tsx                     ← replaces placeholder
    blog/
      BlogDraftScreen.tsx
      BlogPublishedScreen.tsx
      StyleOnboardingScreen.tsx
      PhotoOverrideScreen.tsx          ← select/deselect photos pre-publish
  components/
    BlogPostCard.tsx
    MiniMap.tsx                        ← reuses react-native-maps from Module 7
    PlacesSummary.tsx                  ← categorized place list, reused in Module 10
    ItinerarySection.tsx               ← conditional day-by-day view
  services/
    blogService.ts                     ← createDraft trigger, publishPost, discardDraft, unpublish, export
  supabase/
    functions/
      generate-blog/index.ts           ← Edge Function (Deno)
      send-push/index.ts               ← Push notification dispatcher
```

**New dep:** `expo-notifications`

---

## Key Decisions

| Decision | Choice | Reason |
|---|---|---|
| Generation | Background Edge Function | 60+ seconds is fine; background feels better than blocking UI |
| Draft | Read-only | Keeps V1 scope tight; conversational editing in V2 |
| Photo override | Allowed pre-publish | Preserves user control on the one decision that matters most |
| Moderation | Flag, don't auto-discard | User may disagree; they see the flag and decide |
| Itinerary tab | Conditional on data sufficiency | Only shown when meaningful; not forced with sparse data |
| Style profile | Built passively from own posts | Zero friction; improves over time automatically |
| Cover photo | AI-selected; user can override | Removes friction; preserves control |
| Unpublish | Cleans embeddings + community_destinations | Data integrity; post truly disappears from discovery |
| web_slug | Generated at publish, not draft | Slug is a public identifier; only matters once public |
