# Language Badges — Design Spec

## Summary

Add visual language badges to visit cards that flag pages not in the user's preferred languages. Users configure which languages to hide via a settings UI in both the Chrome extension and PWA.

## Motivation

When browsing Wikipedia, users sometimes follow links to articles in other languages without noticing. Language badges make this visible at a glance, so users can see which pages in their trail are in unfamiliar languages.

## Data Model

A new `language_settings` store in the shared Dexie DB, holding a single-row settings record:

```typescript
interface LanguageBadgeSettings {
  id: string;                  // always "default" (singleton key)
  enabled: boolean;            // default: false
  excludedLanguages: string[]; // e.g., ["en", "es"] — languages that do NOT show a badge
}
```

**Dexie schema change:** Bump from version 1 to version 2. Add store declaration: `language_settings: "id"`. No migration needed — the table starts empty and gets populated on first save.

This is a global setting, not per-trail or per-visit. The `language` field already exists on every `Visit` record (captured from the Wikipedia URL hostname by `parseWikipediaUrl()`).

## Shared Logic (packages/shared)

New utilities:

- `getLanguageBadgeSettings(): Promise<LanguageBadgeSettings>` — reads settings from DB, returns defaults if none saved
- `saveLanguageBadgeSettings(settings: LanguageBadgeSettings): Promise<void>` — writes settings to DB
- `getDistinctLanguages(): Promise<string[]>` — queries the visits table for all unique language codes the user has encountered (excludes soft-deleted visits where `deletedAt` is set)
- `shouldShowLanguageBadge(language: string, settings: LanguageBadgeSettings): boolean` — returns `true` if `enabled` is true AND `language` is not in `excludedLanguages`
- Display code is simply `language.toUpperCase()` inline — no standalone utility needed

## VisitCard Badge (extension + PWA)

When `shouldShowLanguageBadge()` returns true for a visit:

- Render a small inline badge next to the title: `<span class="lang-badge">FR</span>`
- Positioned after the title link, before any source detail
- Styled as a pill: small font, uppercase, rounded corners
- Use the existing `.badge` colors: `background: #e8f0fe; color: #1a73e8`
- No badge shown when the feature is off or the language is in the exclusion list

## Settings UI (extension + PWA)

New section in both the extension `SettingsForm.svelte` and PWA settings page:

**Section title:** "Language badges"

**Controls:**
1. Toggle: "Show language badges on visit cards" — controls `enabled`
2. When enabled, show a list of languages auto-populated from the user's trail history (via `getDistinctLanguages()`)
3. Language list labeled "Hide badges for:" — each row is a checkbox, e.g., `☑ English (EN)`. Checked = badge hidden for that language. Language display names come from a static lookup table mapping codes to names (e.g., `{en: "English", fr: "French"}`); unknown codes show the uppercase code only.
4. Empty state: "Languages will appear here as you browse Wikipedia"

## Approach

- Settings stored in the shared Dexie DB (Approach A from brainstorming)
- Single source of truth, works with sync if enabled
- Settings UI duplicated across extension and PWA (simple enough that a shared component is unnecessary)

## Scope

In scope:
- Language badge on VisitCard in trail detail view
- Settings toggle and exclusion list
- Both extension and PWA

Out of scope:
- Language indicators in trail list summaries
- Full Wikipedia language picker (only auto-populated from history)
- Language-based filtering or sorting of trails
