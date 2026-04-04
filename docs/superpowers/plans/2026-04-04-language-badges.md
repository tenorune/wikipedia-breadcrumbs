# Language Badges Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show language code badges on visit cards for non-excluded languages, with user-configurable settings in both extension and PWA.

**Architecture:** New `language_settings` table in shared Dexie DB (version 2). Shared utility functions for settings CRUD and badge visibility logic. VisitCard components in both extension and PWA render the badge. Settings UI added to both settings pages.

**Tech Stack:** Svelte 5 (runes), Dexie.js, TypeScript, Vitest

**Spec:** `docs/superpowers/specs/2026-04-04-language-badges-design.md`

---

## File Structure

**Create:**
- `packages/shared/src/language-badges/index.ts` — settings CRUD, badge logic, language name lookup
- `packages/shared/tests/language-badges/language-badges.test.ts` — tests for all shared logic

**Modify:**
- `packages/shared/src/db/schema.ts` — bump to v2, add `language_settings` table
- `packages/shared/src/db/index.ts` — export new store
- `packages/shared/src/index.ts` — export language-badges module
- `packages/extension/src/history/VisitCard.svelte` — add badge to title
- `packages/pwa/src/lib/components/VisitCard.svelte` — add badge to title
- `packages/extension/src/options/SettingsForm.svelte` — add Language badges section
- `packages/pwa/src/routes/settings/+page.svelte` — add Language badges section

---

## Chunk 1: Shared Logic + Tests

### Task 1: Dexie Schema v2

**Files:**
- Modify: `packages/shared/src/db/schema.ts`

- [ ] **Step 1: Add LanguageBadgeSettings type and table to schema**

In `packages/shared/src/db/schema.ts`, add the import and table declaration:

```typescript
import Dexie from "dexie";
import type { Table } from "dexie";
import type { Visit } from "../models/visit.js";
import type { Trail } from "../models/trail.js";
import type { ConflictLog } from "../models/conflict-log.js";

export interface LanguageBadgeSettings {
  id: string;                  // always "default"
  enabled: boolean;
  excludedLanguages: string[];
}

export class BreadcrumbsDB extends Dexie {
  visits!: Table<Visit, string>;
  trails!: Table<Trail, string>;
  conflictLogs!: Table<ConflictLog, string>;
  languageSettings!: Table<LanguageBadgeSettings, string>;

  constructor(name = "breadcrumbs") {
    super(name);
    this.version(1).stores({
      visits: "id, trailId, [trailId+position], timestamp, syncStatus, articleId, deletedAt",
      trails: "id, userId, status, startedAt, syncStatus, deviceId, deletedAt",
      conflictLogs: "id, recordType, recordId, resolvedAt, createdAt",
    });
    this.version(2).stores({
      languageSettings: "id",
    });
  }
}
```

- [ ] **Step 2: Run existing tests to confirm v2 migration doesn't break anything**

Run: `cd packages/shared && node_modules/.bin/vitest run`
Expected: All existing tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/db/schema.ts
git commit -m "feat: bump Dexie schema to v2 with language_settings table"
```

---

### Task 2: Language Badge Shared Logic

**Files:**
- Create: `packages/shared/src/language-badges/index.ts`
- Modify: `packages/shared/src/db/index.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/shared/tests/language-badges/language-badges.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { BreadcrumbsDB } from "../../src/db/schema.js";
import type { LanguageBadgeSettings } from "../../src/db/schema.js";
import {
  getLanguageBadgeSettings,
  saveLanguageBadgeSettings,
  getDistinctLanguages,
  shouldShowLanguageBadge,
  LANGUAGE_NAMES,
} from "../../src/language-badges/index.js";
import { createVisit } from "../../src/models/visit.js";
import { SourceType } from "../../src/models/enums.js";

let db: BreadcrumbsDB;

beforeEach(async () => {
  db = new BreadcrumbsDB("test-lang-badges-" + Date.now());
  await db.open();
});

describe("getLanguageBadgeSettings", () => {
  it("returns defaults when no settings saved", async () => {
    const settings = await getLanguageBadgeSettings(db);
    expect(settings.enabled).toBe(false);
    expect(settings.excludedLanguages).toEqual([]);
  });

  it("returns saved settings", async () => {
    await db.languageSettings.put({ id: "default", enabled: true, excludedLanguages: ["en"] });
    const settings = await getLanguageBadgeSettings(db);
    expect(settings.enabled).toBe(true);
    expect(settings.excludedLanguages).toEqual(["en"]);
  });
});

describe("saveLanguageBadgeSettings", () => {
  it("saves and retrieves settings", async () => {
    await saveLanguageBadgeSettings(db, { id: "default", enabled: true, excludedLanguages: ["en", "es"] });
    const settings = await getLanguageBadgeSettings(db);
    expect(settings.enabled).toBe(true);
    expect(settings.excludedLanguages).toEqual(["en", "es"]);
  });

  it("overwrites previous settings", async () => {
    await saveLanguageBadgeSettings(db, { id: "default", enabled: true, excludedLanguages: ["en"] });
    await saveLanguageBadgeSettings(db, { id: "default", enabled: false, excludedLanguages: [] });
    const settings = await getLanguageBadgeSettings(db);
    expect(settings.enabled).toBe(false);
    expect(settings.excludedLanguages).toEqual([]);
  });
});

describe("getDistinctLanguages", () => {
  it("returns empty array when no visits", async () => {
    const langs = await getDistinctLanguages(db);
    expect(langs).toEqual([]);
  });

  it("returns unique languages from visits", async () => {
    const base = { trailId: "t1", position: 1, sourceType: SourceType.Link, articleId: "a" };
    await db.visits.add(createVisit({ ...base, url: "https://en.wikipedia.org/wiki/A", title: "A", language: "en" }));
    await db.visits.add(createVisit({ ...base, url: "https://fr.wikipedia.org/wiki/B", title: "B", language: "fr", position: 2 }));
    await db.visits.add(createVisit({ ...base, url: "https://en.wikipedia.org/wiki/C", title: "C", language: "en", position: 3 }));
    const langs = await getDistinctLanguages(db);
    expect(langs.sort()).toEqual(["en", "fr"]);
  });

  it("excludes soft-deleted visits", async () => {
    const base = { trailId: "t1", position: 1, sourceType: SourceType.Link, articleId: "a" };
    const visit = createVisit({ ...base, url: "https://de.wikipedia.org/wiki/A", title: "A", language: "de" });
    await db.visits.add(visit);
    await db.visits.update(visit.id, { deletedAt: new Date().toISOString() });
    const langs = await getDistinctLanguages(db);
    expect(langs).toEqual([]);
  });
});

describe("shouldShowLanguageBadge", () => {
  it("returns false when disabled", () => {
    const settings: LanguageBadgeSettings = { id: "default", enabled: false, excludedLanguages: [] };
    expect(shouldShowLanguageBadge("fr", settings)).toBe(false);
  });

  it("returns true for non-excluded language when enabled", () => {
    const settings: LanguageBadgeSettings = { id: "default", enabled: true, excludedLanguages: ["en"] };
    expect(shouldShowLanguageBadge("fr", settings)).toBe(true);
  });

  it("returns false for excluded language", () => {
    const settings: LanguageBadgeSettings = { id: "default", enabled: true, excludedLanguages: ["en", "fr"] };
    expect(shouldShowLanguageBadge("fr", settings)).toBe(false);
  });

  it("returns true when enabled with empty exclusion list", () => {
    const settings: LanguageBadgeSettings = { id: "default", enabled: true, excludedLanguages: [] };
    expect(shouldShowLanguageBadge("en", settings)).toBe(true);
  });
});

describe("LANGUAGE_NAMES", () => {
  it("maps common codes to display names", () => {
    expect(LANGUAGE_NAMES["en"]).toBe("English");
    expect(LANGUAGE_NAMES["fr"]).toBe("French");
    expect(LANGUAGE_NAMES["de"]).toBe("German");
    expect(LANGUAGE_NAMES["ja"]).toBe("Japanese");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/shared && node_modules/.bin/vitest run tests/language-badges/language-badges.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the shared logic**

Create `packages/shared/src/language-badges/index.ts`:

```typescript
import type { BreadcrumbsDB, LanguageBadgeSettings } from "../db/schema.js";

const DEFAULT_SETTINGS: LanguageBadgeSettings = {
  id: "default",
  enabled: false,
  excludedLanguages: [],
};

export async function getLanguageBadgeSettings(db: BreadcrumbsDB): Promise<LanguageBadgeSettings> {
  const settings = await db.languageSettings.get("default");
  return settings ?? { ...DEFAULT_SETTINGS };
}

export async function saveLanguageBadgeSettings(db: BreadcrumbsDB, settings: LanguageBadgeSettings): Promise<void> {
  await db.languageSettings.put(settings);
}

export async function getDistinctLanguages(db: BreadcrumbsDB): Promise<string[]> {
  const visits = await db.visits
    .filter((v) => v.deletedAt === null)
    .toArray();
  const langs = new Set(visits.map((v) => v.language));
  return [...langs].sort();
}

export function shouldShowLanguageBadge(language: string, settings: LanguageBadgeSettings): boolean {
  if (!settings.enabled) return false;
  return !settings.excludedLanguages.includes(language);
}

export const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  fr: "French",
  de: "German",
  es: "Spanish",
  it: "Italian",
  pt: "Portuguese",
  ru: "Russian",
  ja: "Japanese",
  zh: "Chinese",
  ko: "Korean",
  ar: "Arabic",
  nl: "Dutch",
  sv: "Swedish",
  pl: "Polish",
  uk: "Ukrainian",
  he: "Hebrew",
  vi: "Vietnamese",
  fi: "Finnish",
  cs: "Czech",
  no: "Norwegian",
  da: "Danish",
  hu: "Hungarian",
  ro: "Romanian",
  tr: "Turkish",
  th: "Thai",
  id: "Indonesian",
  ca: "Catalan",
  el: "Greek",
  hi: "Hindi",
  fa: "Persian",
  bn: "Bengali",
  ms: "Malay",
  ta: "Tamil",
  sr: "Serbian",
  hr: "Croatian",
  bg: "Bulgarian",
  sk: "Slovak",
  sl: "Slovenian",
  lt: "Lithuanian",
  lv: "Latvian",
  et: "Estonian",
};
```

- [ ] **Step 4: Add exports**

In `packages/shared/src/db/index.ts`, add:
```typescript
export type { LanguageBadgeSettings } from "./schema.js";
```

In `packages/shared/src/index.ts`, add:
```typescript
export * from "./language-badges/index.js";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/shared && node_modules/.bin/vitest run tests/language-badges/language-badges.test.ts`
Expected: All tests PASS.

- [ ] **Step 6: Run full shared test suite**

Run: `cd packages/shared && node_modules/.bin/vitest run`
Expected: All tests pass (existing + new).

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/language-badges/ packages/shared/tests/language-badges/ packages/shared/src/db/index.ts packages/shared/src/index.ts
git commit -m "feat: add language badge settings and shared logic with tests"
```

---

## Chunk 2: VisitCard Badge UI

### Task 3: Extension VisitCard Badge

**Files:**
- Modify: `packages/extension/src/history/VisitCard.svelte:170-174`

- [ ] **Step 1: Add language badge to extension VisitCard**

In `packages/extension/src/history/VisitCard.svelte`, add a new prop and the badge markup.

Add to the Props interface (after `onResumed?`):
```typescript
showLanguageBadge?: boolean;
```

Add to destructuring:
```typescript
let { visit, trailId, trailStatus, onUpdateNote, onDelete, onSplit, onResumed, showLanguageBadge }: Props = $props();
```

In the template, after the title link (line 171) and before the `sourceDetail` span (line 172), add:
```svelte
{#if showLanguageBadge}
  <span class="lang-badge">{visit.language.toUpperCase()}</span>
{/if}
```

Add CSS (inside the existing `<style>` block):
```css
.lang-badge { background: #e8f0fe; color: #1a73e8; padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 600; letter-spacing: 0.5px; vertical-align: middle; margin-left: 4px; }
```

- [ ] **Step 2: Pass showLanguageBadge from TrailDetail**

In `packages/extension/src/history/TrailDetail.svelte`, import and use settings.

Extend the existing imports on lines 3-4. Add `getLanguageBadgeSettings`, `shouldShowLanguageBadge` to the value import, and `LanguageBadgeSettings` to the type import:
```typescript
// line 3 — add these to the existing import:
import { BreadcrumbsDB, visitStore, trailStore, splitTrail, mergeTrails, exportTrailsJson, exportTrailsCsv, downloadFile, exportFilename, getLanguageBadgeSettings, shouldShowLanguageBadge } from "@wikipedia-breadcrumbs/shared";
// line 4 — add LanguageBadgeSettings to the existing type import:
import type { Trail, Visit, LanguageBadgeSettings } from "@wikipedia-breadcrumbs/shared";
```

Add state (near other state declarations around line 16):
```typescript
let langSettings: LanguageBadgeSettings | null = $state(null);
```

Load settings using the existing `db` instance (line 123: `const db = new BreadcrumbsDB()`). Add after the existing `loadVisits()` call:
```typescript
getLanguageBadgeSettings(db).then((s) => { langSettings = s; });
```

Pass to each VisitCard:
```svelte
showLanguageBadge={langSettings ? shouldShowLanguageBadge(visit.language, langSettings) : false}
```

- [ ] **Step 3: Build the extension to verify**

Run: `pnpm --filter extension build`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/extension/src/history/VisitCard.svelte packages/extension/src/history/TrailDetail.svelte
git commit -m "feat: add language badge to extension VisitCard"
```

---

### Task 4: PWA VisitCard Badge

**Files:**
- Modify: `packages/pwa/src/lib/components/VisitCard.svelte`
- Modify: `packages/pwa/src/lib/components/TrailDetail.svelte`

- [ ] **Step 1: Add language badge to PWA VisitCard**

In `packages/pwa/src/lib/components/VisitCard.svelte`, add the prop and badge.

Add to Props interface (after `onSplit?`):
```typescript
showLanguageBadge?: boolean;
```

Add to destructuring (line 12):
```typescript
let { visit, onUpdateNote, onDelete, onSplit, showLanguageBadge }: Props = $props();
```

In the template, after the title link and before the `sourceDetail` span, add:
```svelte
{#if showLanguageBadge}
  <span class="lang-badge">{visit.language.toUpperCase()}</span>
{/if}
```

Add CSS (inside the existing `<style>` block):
```css
.lang-badge { background: #e8f0fe; color: #1a73e8; padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 600; letter-spacing: 0.5px; vertical-align: middle; margin-left: 4px; }
```

- [ ] **Step 2: Pass showLanguageBadge from PWA TrailDetail**

In `packages/pwa/src/lib/components/TrailDetail.svelte`:

Extend the existing imports on lines 3-4. Add `getLanguageBadgeSettings`, `shouldShowLanguageBadge` to the value import (line 3), and `LanguageBadgeSettings` to the type import (line 4):
```typescript
// line 3 — add these to the existing import:
import { trailStore, visitStore, splitTrail, mergeTrails, TrailStatus, exportTrailsJson, exportTrailsCsv, downloadFile, exportFilename, getLanguageBadgeSettings, shouldShowLanguageBadge } from "@wikipedia-breadcrumbs/shared";
// line 4 — add LanguageBadgeSettings to the existing type import:
import type { Trail, Visit, LanguageBadgeSettings } from "@wikipedia-breadcrumbs/shared";
```

The PWA already has `db` imported from `$lib/stores/db` (line 5). Add state:
```typescript
let langSettings: LanguageBadgeSettings | null = $state(null);
```

Load settings using the existing `db` (add near other data loading):
```typescript
getLanguageBadgeSettings(db).then((s) => { langSettings = s; });
```

Pass to each of the 4 VisitCard instances in the template (there are 4: parent, focused, children loop, and flat list):
```svelte
showLanguageBadge={langSettings ? shouldShowLanguageBadge(visit.language, langSettings) : false}
```

- [ ] **Step 3: Build the PWA to verify**

Run: `pnpm --filter pwa build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add packages/pwa/src/lib/components/VisitCard.svelte packages/pwa/src/lib/components/TrailDetail.svelte
git commit -m "feat: add language badge to PWA VisitCard"
```

---

## Chunk 3: Settings UI

### Task 5: Extension Settings UI

**Files:**
- Modify: `packages/extension/src/options/SettingsForm.svelte`

- [ ] **Step 1: Add language badges section to extension settings**

Extend the existing import from `@wikipedia-breadcrumbs/shared` to add language badge functions. The extension SettingsForm already imports `BreadcrumbsDB`:
```typescript
import { BreadcrumbsDB, getLanguageBadgeSettings, saveLanguageBadgeSettings, getDistinctLanguages, LANGUAGE_NAMES } from "@wikipedia-breadcrumbs/shared";
import type { LanguageBadgeSettings } from "@wikipedia-breadcrumbs/shared";
```

Add state:
```typescript
let langBadgeEnabled = $state(false);
let excludedLanguages: string[] = $state([]);
let availableLanguages: string[] = $state([]);
const langDb = new BreadcrumbsDB();
```

Load settings (add near other initialization):
```typescript
getLanguageBadgeSettings(langDb).then((s) => {
  langBadgeEnabled = s.enabled;
  excludedLanguages = [...s.excludedLanguages];
});
getDistinctLanguages(langDb).then((langs) => { availableLanguages = langs; });
```

Add save function (reuses the same `langDb` instance):
```typescript
async function saveLangSettings() {
  await saveLanguageBadgeSettings(langDb, {
    id: "default",
    enabled: langBadgeEnabled,
    excludedLanguages,
  });
}
```

Add template section (after existing settings, before auth section):
```svelte
<fieldset>
  <legend>Language badges</legend>
  <label>
    <input type="checkbox" bind:checked={langBadgeEnabled} onchange={saveLangSettings} />
    Show language badges on visit cards
  </label>
  {#if langBadgeEnabled}
    {#if availableLanguages.length > 0}
      <p class="hint">Hide badges for:</p>
      {#each availableLanguages as lang}
        <label class="lang-option">
          <input
            type="checkbox"
            checked={excludedLanguages.includes(lang)}
            onchange={() => {
              if (excludedLanguages.includes(lang)) {
                excludedLanguages = excludedLanguages.filter((l) => l !== lang);
              } else {
                excludedLanguages = [...excludedLanguages, lang];
              }
              saveLangSettings();
            }}
          />
          {LANGUAGE_NAMES[lang] ?? lang.toUpperCase()} ({lang.toUpperCase()})
        </label>
      {/each}
    {:else}
      <p class="hint">Languages will appear here as you browse Wikipedia</p>
    {/if}
  {/if}
</fieldset>
```

Add CSS for the new section (follow existing patterns in the file):
```css
.lang-option { display: block; margin: 4px 0 4px 16px; font-size: 13px; }
.hint { font-size: 12px; color: #666; margin: 8px 0 4px; }
```

- [ ] **Step 2: Build and verify**

Run: `pnpm --filter extension build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add packages/extension/src/options/SettingsForm.svelte
git commit -m "feat: add language badges settings to extension"
```

---

### Task 6: PWA Settings UI

**Files:**
- Modify: `packages/pwa/src/routes/settings/+page.svelte`

- [ ] **Step 1: Add language badges section to PWA settings**

In `packages/pwa/src/routes/settings/+page.svelte`:

Add imports (the PWA uses `db` from `$lib/stores/db`, not `new BreadcrumbsDB()`):
```typescript
import { getLanguageBadgeSettings, saveLanguageBadgeSettings, getDistinctLanguages, LANGUAGE_NAMES } from "@wikipedia-breadcrumbs/shared";
import type { LanguageBadgeSettings } from "@wikipedia-breadcrumbs/shared";
import { db } from "$lib/stores/db";
```

Note: `db` may already be imported. If so, just add to the existing shared import.

Add state:
```typescript
let langBadgeEnabled = $state(false);
let excludedLanguages: string[] = $state([]);
let availableLanguages: string[] = $state([]);
```

Load settings (add near other initialization):
```typescript
getLanguageBadgeSettings(db).then((s) => {
  langBadgeEnabled = s.enabled;
  excludedLanguages = [...s.excludedLanguages];
});
getDistinctLanguages(db).then((langs) => { availableLanguages = langs; });
```

Add save function:
```typescript
async function saveLangSettings() {
  await saveLanguageBadgeSettings(db, {
    id: "default",
    enabled: langBadgeEnabled,
    excludedLanguages,
  });
}
```

Add template section (after existing settings sections, before auth):
```svelte
<fieldset>
  <legend>Language badges</legend>
  <label>
    <input type="checkbox" bind:checked={langBadgeEnabled} onchange={saveLangSettings} />
    Show language badges on visit cards
  </label>
  {#if langBadgeEnabled}
    {#if availableLanguages.length > 0}
      <p class="hint">Hide badges for:</p>
      {#each availableLanguages as lang}
        <label class="lang-option">
          <input
            type="checkbox"
            checked={excludedLanguages.includes(lang)}
            onchange={() => {
              if (excludedLanguages.includes(lang)) {
                excludedLanguages = excludedLanguages.filter((l) => l !== lang);
              } else {
                excludedLanguages = [...excludedLanguages, lang];
              }
              saveLangSettings();
            }}
          />
          {LANGUAGE_NAMES[lang] ?? lang.toUpperCase()} ({lang.toUpperCase()})
        </label>
      {/each}
    {:else}
      <p class="hint">Languages will appear here as you browse Wikipedia</p>
    {/if}
  {/if}
</fieldset>
```

Add CSS:
```css
.lang-option { display: block; margin: 4px 0 4px 16px; font-size: 13px; }
.hint { font-size: 12px; color: #666; margin: 8px 0 4px; }
```

- [ ] **Step 2: Build and verify**

Run: `pnpm --filter pwa build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add packages/pwa/src/routes/settings/+page.svelte
git commit -m "feat: add language badges settings to PWA"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Run full shared test suite**

Run: `cd packages/shared && node_modules/.bin/vitest run`
Expected: All tests pass.

- [ ] **Step 2: Build all packages**

Run: `pnpm build`
Expected: All packages build successfully.

- [ ] **Step 3: Final commit if any cleanup needed**

Only commit if there are unstaged changes. Use specific file paths, not `git add -A`.
