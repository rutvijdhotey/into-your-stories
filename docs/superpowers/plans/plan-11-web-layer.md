# Module 11 — Web Layer
**App:** Into Your Stories
**Status:** Design doc — pending approval before execution
**Depends on:** Module 9 (published blog_posts, web_slug), Module 10 (community context)

---

## Purpose

Give every published post a real web URL — readable in any browser, no app required. This is a key product decision: organic reach, link sharing, and indexability by search engines. The web layer is read-only; all write operations require the app.

After this module: published posts have live public URLs. Sharing a post works for anyone, anywhere.

---

## Architecture

A separate Next.js application lives in a `web/` subdirectory of the monorepo. It is deployed independently (Vercel). It shares the same Supabase project as the mobile app — reading published post data from the same database using a server-side Supabase client with the anon key (subject to RLS: published posts are publicly readable).

The mobile app and the web app do not share React Native components. The web app renders its own HTML/CSS components that visually match the app's aesthetic but are built with standard web tech.

---

## Routes

### `/stories/[slug]`

The only public route in V1. Renders a single published blog post.

**Data fetching:** Server-side rendering (SSR) via Next.js `generateStaticParams` + `revalidate` (ISR). The page is pre-rendered at publish time and revalidated when the post is updated (unpublished → page returns 404 or "This story is no longer available").

**Page layout (matches in-app PublishedPostView):**
- Full-width hero image
- Post title + author display name + trip date range + destination
- Narrative body with inline photos (rendered from Markdown using `react-markdown` or `remark`)
- Structured Places summary (HTML table/list)
- Mini-map (Leaflet, not Apple Maps — Apple Maps is iOS-only)
- Itinerary section (conditional)
- App acquisition CTA: "Capture your own stories" → App Store link (always shown on web)
- Site header: app name + "Open in app" deep link (universal link if configured, App Store link as fallback)

### 404 / unpublished post

If `web_slug` doesn't match a published post: standard 404 page with a prompt to browse the app.

---

## Mini-Map: Leaflet

Apple Maps is iOS-only. The web mini-map uses [Leaflet](https://leafletjs.com) with OpenStreetMap tiles — free, no API key required.

The map renders the same Place pins as the in-app mini-map: color-coded by category, all places from the post. Leaflet's default tile layer is replaced with a dark tile layer (e.g., CartoDB Dark Matter) to match the app's aesthetic.

---

## SEO & Metadata

Every post page gets:
- `<title>`: `{post title} — Into Your Stories`
- `<meta name="description">`: First sentence of the narrative (trimmed to 160 chars)
- Open Graph tags:
  - `og:title`: post title
  - `og:description`: first sentence of narrative
  - `og:image`: cover photo URL (from `blog-assets/` public bucket)
  - `og:url`: canonical post URL
  - `og:type`: `article`
- `<link rel="canonical">`: canonical post URL
- `robots: index, follow` for published posts; `noindex` for any draft-preview routes (none in V1)

---

## Web URL Generation

`web_slug` is set at publish time in Module 9:
- Format: `{trip-name-slugified}-{6-char-random-alphanum}` (e.g., `japan-2024-a3b9xk`)
- Stored on `blog_posts.web_slug` (unique constraint in DB)
- Full URL: `https://intoyourstories.app/stories/{web_slug}` (or whatever domain is configured)

The base URL is stored in an env var (`WEB_BASE_URL`) shared between the mobile app and the Edge Function. The mobile app constructs the share URL from this base + slug.

---

## Deployment

- Hosted on Vercel (free tier sufficient for V1)
- Connected to the monorepo's `web/` directory
- Automatic deploys on `main` branch push
- Environment variables set in Vercel dashboard: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `WEB_BASE_URL`

---

## File Structure

```
web/
  app/
    stories/
      [slug]/
        page.tsx              ← SSR post page
        opengraph-image.tsx   ← Dynamic OG image (Next.js image generation)
    not-found.tsx             ← 404 page
    layout.tsx                ← shared HTML shell, fonts, global styles
  components/
    StoryRenderer.tsx         ← Markdown → HTML narrative renderer
    WebMiniMap.tsx            ← Leaflet map with category pins
    PlacesSummaryWeb.tsx      ← HTML version of PlacesSummary
    ItinerarySectionWeb.tsx   ← HTML version of ItinerarySection
    AcquisitionCTA.tsx        ← "Capture your stories" + App Store link
  lib/
    supabase.ts               ← Server-side Supabase client (anon key + SSR)
    slugUtils.ts              ← slug validation + formatting helpers
```

**New deps (web only):** `next`, `leaflet`, `react-leaflet`, `react-markdown`, `remark-gfm`

---

## Key Decisions

| Decision | Choice | Reason |
|---|---|---|
| Framework | Next.js | SSR + ISR + file-based routing; Vercel integration is seamless |
| Rendering | SSR with ISR | Fast initial load; pages stay fresh without full re-render on every request |
| Maps | Leaflet + OpenStreetMap | Apple Maps is iOS-only; Leaflet is free and works on web |
| Map tiles | CartoDB Dark Matter | Free dark tiles that match app aesthetic |
| Markdown renderer | react-markdown + remark-gfm | Standard, well-maintained, supports tables and inline images |
| Monorepo location | `web/` subdirectory | Single repo; shared env vars; easy to reference same Supabase project |
| Write operations | App only (no web forms) | Web is read-only in V1; simpler security model |
| OG image | Dynamic via Next.js image generation | Post title + cover photo; improves social sharing appearance |
