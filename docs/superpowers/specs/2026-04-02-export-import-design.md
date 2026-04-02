# Export/Import Trails — Design Spec

## Purpose

Backup/restore is the primary use case. Sharing trails with others is secondary. Spreadsheet analysis is nice-to-have via CSV export.

## Formats

### JSON (full round-trip)

Single file with nested structure — visits inside their parent trail:

```json
{
  "version": 1,
  "exportedAt": "2026-04-02T...",
  "trails": [
    {
      "id": "uuid",
      "name": "Trail name",
      "createdAt": "...",
      "startedAt": "...",
      "endedAt": "...",
      "status": "finalized",
      "isStarred": true,
      "tags": [],
      "note": "...",
      "visibility": "private",
      "forkedFromVisitId": null,
      "startReason": "auto_new_tab",
      "visits": [
        {
          "id": "uuid",
          "url": "https://en.wikipedia.org/wiki/...",
          "title": "Article Title",
          "timestamp": "...",
          "lastVisitedAt": "...",
          "position": 1,
          "sourceType": "link",
          "sourceDetail": "linked as ...",
          "note": "...",
          "summary": null,
          "thumbnailUrl": null,
          "language": "en",
          "articleId": "Article_Title",
          "parentVisitId": null
        }
      ]
    }
  ]
}
```

**Excluded fields** (internal/device-specific, regenerated on import): `userId`, `syncStatus`, `deletedAt`, `tabId`, `windowId`, `deviceId`.

### CSV (read-only export)

Flat format, one row per visit. Trail fields repeat on each row:

```
trail_id,trail_name,trail_status,trail_started_at,trail_note,trail_is_starred,visit_id,visit_title,visit_url,visit_timestamp,visit_last_visited_at,visit_position,visit_note,visit_source_type,visit_source_detail,visit_language,visit_article_id,visit_parent_visit_id
```

No CSV import — mapping flat rows back to the trail/visit hierarchy adds complexity for a marginal use case.

## Export Scope

- **Per-trail**: Export button on TrailDetail exports one trail + its visits.
- **Bulk**: "Export all" button on TrailList exports all non-deleted trails + visits.
- Both offer a JSON/CSV choice via dropdown.

## Import Flow

1. **Parse & validate** — check `version` field, validate structure. Reject with clear error if malformed.
2. **Detect conflicts** — for each trail, check if a trail with that `id` exists locally.
3. **No conflicts** — import directly. Set `syncStatus: local_only`, assign current `deviceId` and `userId`.
4. **Conflicts** — show dialog listing conflicting trails with per-trail choices:
   - **Skip** — keep local, don't import
   - **Overwrite** — replace local trail and visits with imported data
   - **Import as copy** — import with fresh trail ID, remap `trailId` and `parentVisitId` references on visits
5. **Summary** — show result: "Imported 3 trails (12 visits). Skipped 1."

Non-conflicting trails import automatically without prompting.

## Architecture

Shared library (`packages/shared/src/export/`) handles all data logic. Extension and PWA provide thin UI wrappers for file I/O and conflict dialogs.

### Shared API (`packages/shared/src/export/index.ts`)

```typescript
exportTrailsJson(db: BreadcrumbsDB, trailIds?: string[]): Promise<string>
```
Exports specified trails (or all) as JSON string. Filters out soft-deleted records.

```typescript
exportTrailsCsv(db: BreadcrumbsDB, trailIds?: string[]): Promise<string>
```
Same selection logic, returns CSV string.

```typescript
parseImportJson(jsonString: string): { trails: ImportTrail[], errors: string[] }
```
Validates and parses JSON. No DB access. Returns structured data or validation errors.

```typescript
detectConflicts(db: BreadcrumbsDB, trails: ImportTrail[]): Promise<{ clean: ImportTrail[], conflicts: ConflictItem[] }>
```
Checks each trail ID against local DB.

```typescript
executeImport(db: BreadcrumbsDB, plan: ImportPlan, context: ImportContext): Promise<ImportResult>
```
Writes to DB per the resolved plan. Handles ID remapping for copies.

### Types

```typescript
interface ImportTrail {
  // Trail fields (exported subset) + nested visits
  id: string;
  name: string | null;
  createdAt: string;
  startedAt: string;
  endedAt: string | null;
  status: string;
  isStarred: boolean;
  tags: string[];
  note: string | null;
  visibility: string;
  forkedFromVisitId: string | null;
  startReason: string;
  visits: ImportVisit[];
}

interface ImportVisit {
  id: string;
  url: string;
  title: string;
  timestamp: string;
  lastVisitedAt: string;
  position: number;
  sourceType: string;
  sourceDetail: string | null;
  note: string | null;
  summary: string | null;
  thumbnailUrl: string | null;
  language: string;
  articleId: string;
  parentVisitId: string | null;
}

interface ConflictItem {
  imported: ImportTrail;
  local: Trail;
}

interface ImportPlan {
  items: Array<{
    trail: ImportTrail;
    action: "skip" | "overwrite" | "copy";
  }>;
}

interface ImportContext {
  userId: string | null;
  deviceId: string;
}

interface ImportResult {
  trailsImported: number;
  visitsImported: number;
  skipped: number;
}
```

## UI Entry Points

### TrailDetail (extension + PWA)
- "Export" button in the action area alongside Star and Merge
- Dropdown for JSON / CSV choice

### TrailList (extension + PWA)
- "Export all" button near search/sort controls, with JSON/CSV dropdown
- "Import" button next to "Export all"
- Import opens file picker (`.json` only)
- Conflict dialog shown if needed
- Summary toast/message after import

## File Naming

- Per-trail: `wikipedia-breadcrumbs-{trail-name-slug}-{date}.json` (or `.csv`)
- Bulk: `wikipedia-breadcrumbs-export-{date}.json` (or `.csv`)
