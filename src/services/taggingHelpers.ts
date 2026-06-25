import { CATEGORIES, type Category } from './noteHelpers';
import type { LocationSource } from './locationHelpers';

export type TagSuggestion = {
  category: Category;
  place_name: string | null;
  city: string | null;
};

export type ExistingTags = {
  category: Category | null;
  city: string | null;
  place_name?: string | null;
  location_source?: LocationSource | null;
};

export function validateCategory(value: unknown): Category {
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    const match = CATEGORIES.find((c) => c === lower);
    if (match) return match;
  }
  return 'general';
}

function toNullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeSuggestion(data: unknown): TagSuggestion {
  const obj = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  return {
    category: validateCategory(obj.category),
    place_name: toNullableString(obj.place_name),
    city: toNullableString(obj.city),
  };
}

export function mergeTags(existing: ExistingTags, suggestion: TagSuggestion): TagSuggestion {
  return {
    category: existing.category ?? suggestion.category,
    // Manual user-typed names are authoritative; otherwise the AI-extracted
    // venue wins over the geocoder's street/area label, which only fills in
    // when the AI found no venue.
    place_name:
      existing.location_source === 'manual'
        ? existing.place_name ?? null
        : suggestion.place_name ?? existing.place_name ?? null,
    city: existing.city ?? suggestion.city,
  };
}
