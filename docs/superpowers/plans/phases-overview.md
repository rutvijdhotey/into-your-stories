# Notebound — Implementation Phases

Each phase produces working, testable software. Write one phase plan at a time.

| Phase | Plan File | What It Builds | Outcome |
|---|---|---|---|
| 1 | `2026-05-06-phase-1-scaffold-auth.md` | Expo scaffold + navigation + Supabase auth | Running app you can log into |
| 2 | TBD | Trip CRUD + Home screen | Create / view / delete trips |
| 3 | TBD | Note capture — text + voice + photo + EXIF + GPS | Core capture loop, no AI |
| 4 | TBD | AI smart tagging pipeline | Auto-category, place name, city on every save |
| 5 | TBD | Map view with categorized pins | Apple Maps, per-trip color-coded pins |
| 6 | TBD | Destinations view | Cross-trip city aggregation |
| 7 | TBD | Semantic search — Cohere + pgvector | Meaning-based search across all notes |
| 8 | TBD | Blog pipeline — style onboarding + generation + editor + publish + export | End-to-end blog creation |

## Rules
- Write the next phase plan only after the current phase is complete and committed.
- Each phase plan lives in `docs/superpowers/plans/`.
- Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to execute each plan.
