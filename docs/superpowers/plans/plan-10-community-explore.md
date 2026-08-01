# Module 10 — Community & Explore
**App:** Notebound
**Status:** Design doc — pending approval before execution
**Depends on:** Module 9 (published blog_posts, community_destinations populated on publish)

---

## Purpose

Build the community discovery layer. The Explore tab lets anyone browse published travel stories, organized by destination. Each destination page shows an aggregated map of every Place ever mentioned in published posts there, plus a list of the posts themselves. Published posts are readable in-app in full detail.

After this module: the Explore tab is live. Community content is discoverable. The app is a two-sided product — creators and readers.

---

## ExploreScreen

The default landing screen for all users, authenticated or not (see Module 1's PublicNavigator). No login required to browse.

**Layout:**

**Top: search bar** — filters the destination grid by city name. Text match only (no semantic search on destinations in V1).

**Middle: Destination Grid** — a 2-column grid of destination cards. Each card shows:
- A representative cover photo (the most recently published post's cover photo for that destination)
- City name
- Story count ("14 stories")
- Sorted by: recency of last published post (most recently active destination appears first)
- A destination only appears in the grid once at least one published post exists for it

**Bottom strip: "Recently Published"** — horizontal scrollable row of the 10 most recently published posts globally, regardless of destination. Each card: cover photo, title, author display name. This gives fresh content visibility without requiring users to browse by destination.

**Empty state (no published posts in system yet):** A holding message — "Be the first to share a story." with a CTA to start a trip. Only visible during early app life.

---

## DestinationPage

Reached by tapping a destination card in ExploreScreen. Accessible to unauthenticated users.

**Layout (continuous scroll, no tab switcher):**

**Top section: Aggregated Community Map**
- Apple Maps (same `react-native-maps` as Module 7)
- Dark map style
- Pins for every Place from every published post for this destination
- Color-coded by category (same color scheme as Module 7)
- Category filter row below the map — filters pins by category
- Tapping a pin shows a callout with: place name, category, author display name, a snippet of the post it came from. Tapping the callout navigates to that PublishedPostView.

**Below map: Blog Post List**
- Chronological list (most recently published first) of all posts for this destination
- Each card: cover photo, title, author display name, trip date range, one-line excerpt (first sentence of the narrative)
- Tapping → PublishedPostView

---

## PublishedPostView

Full in-app reading experience for a published post. Accessible from DestinationPage, from community search results (Module 8), and directly via deep link from the web URL.

**Layout (continuous scroll):**
- Full-bleed hero image (cover photo)
- Author display name + trip date range + destination
- Narrative body with contextually placed photos (rendered from Markdown)
- Structured Places summary (`PlacesSummary` component — reused from Module 9)
- Mini-map (`MiniMap` component — reused from Module 9) — all Place pins from this post
- Itinerary section — shown only if data was sufficient (conditional, same as Module 9)
- Share button (top-right) — copies the web URL to clipboard + opens native share sheet
- **Acquisition CTA** (bottom of post): "Capture your own stories →" with App Store link. Shown to unauthenticated users and users with no trips.

**Author-specific controls:**
If the viewing user is the post's author: a settings menu (top-right) replaces the Share-only button with: Share + Unpublish + Export. Same as BlogPublishedScreen from Module 9 — they are the same component with a prop for `isAuthor`.

**Report button:** Every post has a "Report" option accessible from a "..." menu. Stores a row in `reports` table. No visual confirmation beyond a toast ("Thanks for letting us know."). Manual review queue — no automated action in V1.

---

## Community Destinations Indexing

This is the data pipeline that powers the DestinationPage map. Managed by the `generate-blog` Edge Function (Module 9) at publish time, and by the `blogService.unpublish()` path.

**On publish:**
For every `places` row belonging to the trip:
- Insert into `community_destinations`: city, place_id, post_id, place_name, category, lat, lng, last_published_at

**On unpublish:**
- Delete all `community_destinations` rows where `post_id = post.id`

The destination grid's sort order (`last_published_at`) is the maximum `last_published_at` across all rows for a city. This updates automatically when new posts are published or unpublished.

---

## File Structure

```
src/
  screens/
    ExploreScreen.tsx                  ← replaces placeholder from Module 1
    explore/
      DestinationPage.tsx
      PublishedPostView.tsx
  components/
    DestinationCard.tsx
    PostPreviewCard.tsx                ← used in DestinationPage list + Recently Published strip
    ReportButton.tsx
    AcquisitionCTA.tsx
  services/
    communityService.ts                ← getDestinations, getDestinationPosts, getPostDetail
```

---

## Key Decisions

| Decision | Choice | Reason |
|---|---|---|
| Explore sort | Recency of last published post | Keeps grid dynamic; rewards active destinations |
| Destination grid threshold | ≥ 1 published post | Only real content appears; no placeholder destinations |
| Aggregated map source | community_destinations table | Pre-indexed; no expensive JOIN on every page load |
| Report action | Store row, manual review | Automated moderation at V1 scale is overkill |
| Acquisition CTA | Bottom of every post | Non-intrusive placement; appears after reading value has been delivered |
| Unauthenticated access | Full Explore + post reading | Value before commitment; acquisition through content |
| PublishedPostView + BlogPublishedScreen | Same component, isAuthor prop | No duplication; author controls added conditionally |
