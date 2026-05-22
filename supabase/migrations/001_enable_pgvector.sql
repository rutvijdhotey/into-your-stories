-- Enable pgvector for future semantic search (Phase 7).
-- No-op until vector columns are added; enabling now avoids touching extensions twice.
create extension if not exists vector;
