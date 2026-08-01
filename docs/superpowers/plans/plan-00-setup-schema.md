# Module 0 — Setup & Schema
**App:** Notebound
**Status:** Design doc — pending approval before execution

---

## Purpose

Establish the complete Supabase backend before any application code runs. Every subsequent module reads from and writes to this schema. Getting this right up front avoids costly migrations mid-development.

---

## Supabase Project Configuration

- One Supabase project: `notebound`
- Region: closest to primary developer (latency matters for local dev)
- Supabase CLI installed locally for migration management (`supabase db push`)
- Environment variables stored in `.env` (gitignored), template in `.env.example`

**Required env vars:**
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — server-side only (Edge Functions); never in app bundle

---

## Extensions

- **pgvector** — enabled on the Postgres instance via migration. Powers semantic search. Stores 1024-dimensional vectors from Cohere `embed-english-v3.0`.

---

## Database Tables

### `profiles`
Extends Supabase Auth users. Created automatically on signup via database trigger.

| Column | Type | Notes |
|---|---|---|
| id | uuid | FK → auth.users.id (PK) |
| display_name | text | Required; set during onboarding step after signup |
| style_profile_id | uuid | FK → style_profiles.id; nullable |
| created_at | timestamptz | auto |

---

### `trips`
The core organizing unit. Everything belongs to a trip.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK → auth.users.id |
| name | text | e.g. "Japan 2024" |
| destinations | text[] | Array of city names |
| start_date | date | nullable |
| end_date | date | nullable |
| status | text | `active` or `completed` |
| cover_photo_url | text | nullable; URL in Supabase Storage |
| note_count | int | Denormalized counter; updated via trigger |
| created_at | timestamptz | auto |

---

### `notes`
Captures voice/text input per trip. The atomic unit of personal data.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| trip_id | uuid | FK → trips.id |
| user_id | uuid | FK → auth.users.id |
| content | text | Transcribed voice or typed text |
| category | text | `Food`, `Stay`, `Activity`, `Shopping`, `To-Visit`, `General` |
| place_name | text | nullable; AI-extracted |
| city | text | nullable; GPS or AI-extracted |
| lat | float8 | nullable; GPS or EXIF |
| lng | float8 | nullable; GPS or EXIF |
| photo_urls | text[] | Supabase Storage URLs |
| photo_descriptions | jsonb | `[{ url, description }]`; populated by Claude Vision |
| tagging_status | text | `pending`, `processing`, `done` |
| offline_id | text | Client-generated ID for offline dedup |
| created_at | timestamptz | Device time on capture |
| synced_at | timestamptz | Server time on sync |

---

### `places`
Extracted from notes when a specific named location is detected by AI tagging.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| note_id | uuid | FK → notes.id |
| trip_id | uuid | FK → trips.id |
| user_id | uuid | FK → auth.users.id |
| name | text | Place name |
| category | text | Same enum as notes |
| lat | float8 | |
| lng | float8 | |
| city | text | |

---

### `blog_posts`
AI-generated narrative from a completed trip.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| trip_id | uuid | FK → trips.id |
| user_id | uuid | FK → auth.users.id |
| title | text | AI-generated; user cannot edit in V1 |
| content_markdown | text | Full AI-drafted post |
| status | text | `generating`, `draft`, `published`, `discarded` |
| cover_photo_url | text | AI-selected; user can override |
| selected_photo_urls | text[] | AI-selected set; user can override |
| web_slug | text | unique; URL-safe; e.g. `japan-2024-abc123` |
| push_token | text | Expo push token at time of generation request |
| moderation_flagged | bool | Set by Claude content check |
| published_at | timestamptz | nullable |
| created_at | timestamptz | auto |

---

### `embeddings`
Stores Cohere vector embeddings for semantic search.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| source_type | text | `note` or `post` |
| source_id | uuid | FK → notes.id or blog_posts.id |
| user_id | uuid | nullable; null for published posts (public) |
| embedding | vector(1024) | Cohere embed-english-v3.0 |
| created_at | timestamptz | auto |

Index: `ivfflat` index on `embedding` using cosine distance for fast ANN search.

---

### `style_profiles`
Claude's analysis of a user's writing style. Optional; one per user.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK → auth.users.id (unique) |
| raw_samples | text[] | Up to 5 blog post samples pasted by user |
| analysis | jsonb | Claude's structured style breakdown |
| created_at | timestamptz | auto |

---

### `reports`
User-submitted content flags on published posts.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| post_id | uuid | FK → blog_posts.id |
| reporter_id | uuid | FK → auth.users.id |
| reason | text | Free text; optional |
| created_at | timestamptz | auto |

---

### `community_destinations`
Aggregated index of Places from all published posts, by city. Powers the Explore tab destination pages.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| city | text | Destination name |
| place_id | uuid | FK → places.id |
| post_id | uuid | FK → blog_posts.id |
| place_name | text | Denormalized for query performance |
| category | text | Denormalized |
| lat | float8 | Denormalized |
| lng | float8 | Denormalized |
| last_published_at | timestamptz | Updated on publish; used for recency sort |

Populated by Edge Function on publish. Rows deleted on unpublish.

---

## RLS Policy Design

| Table | Public read | Owner read/write | Notes |
|---|---|---|---|
| profiles | ✅ (display_name only) | ✅ | Name shown on published posts |
| trips | ❌ | ✅ | Fully private |
| notes | ❌ | ✅ | Fully private |
| places | ❌ | ✅ | Fully private |
| blog_posts | ✅ (when published) | ✅ | Public can SELECT where status='published' |
| embeddings (notes) | ❌ | ✅ | Personal notes embeddings |
| embeddings (posts) | ✅ | ✅ | Published post embeddings for community search |
| style_profiles | ❌ | ✅ | Fully private |
| reports | ❌ | INSERT only | Anyone authenticated can file; cannot read others' |
| community_destinations | ✅ | ❌ (service role only) | Read-only for app; written by Edge Functions |

---

## Storage Buckets

| Bucket | Access | Contents |
|---|---|---|
| `photos` | Private (owner only) | Original photos attached to notes |
| `blog-assets` | Public read | Photos used in published blog posts; copies from `photos` bucket on publish |

Rationale for two buckets: Personal photos stay private. When a post is published, referenced photos are copied to `blog-assets` so they're publicly accessible via URL without exposing the user's full photo bucket.

---

## Migration File Structure

```
supabase/
  migrations/
    001_enable_pgvector.sql
    002_profiles.sql
    003_trips.sql
    004_notes.sql
    005_places.sql
    006_blog_posts.sql
    007_embeddings.sql
    008_style_profiles.sql
    009_reports.sql
    010_community_destinations.sql
    011_rls_policies.sql
    012_triggers.sql          ← profiles auto-create + note_count trigger
    013_indexes.sql           ← ivfflat on embeddings, city on community_destinations
```

---

## Key Decisions

| Decision | Choice | Reason |
|---|---|---|
| Denormalize community_destinations | Yes | Avoid expensive JOINs on every Explore page load |
| note_count on trips | Denormalized trigger | Avoids COUNT(*) on every Home screen load |
| Two storage buckets | photos (private) + blog-assets (public) | Privacy: personal photos never publicly accessible |
| pgvector dimensions | 1024 | Matches Cohere embed-english-v3.0 output |
| Offline ID on notes | Client-generated UUID | Prevents duplicate rows if sync retries |
| community_destinations managed by service role | Yes | RLS prevents app clients from writing; data integrity enforced at Edge Function level |
| blog_posts status enum | generating / draft / published / discarded | Tracks full lifecycle; `generating` lets UI show a loading state |
