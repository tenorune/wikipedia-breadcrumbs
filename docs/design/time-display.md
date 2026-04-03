# Time Display Reference

How timestamps are sourced and displayed across the app.

---

## Sync Information (PWA)

### Home Page

- **Authenticated + has synced**: "Last synced X ago · Sync"
- **Authenticated + never synced**: "Not yet synced · Sync"
- **Not authenticated**: "Sign in to sync across devices →"
- **Offline**: Sync link replaced with "(offline)" — timestamp still shown

`syncState.lastSyncTime` is set only after a successful `syncNow()` completes with Supabase. It is stored in localStorage and persists across sessions. The timestamp represents the last time the system successfully exchanged data with Supabase, not a local operation.

### Sync Age Format

Uses `formatSyncAge()`:
- Under 1 minute: "just now"
- Under 1 hour: "X minute(s) ago"
- Under 1 day: "X hour(s), Y minute(s) ago"
- 1+ days: "X day(s), Y hour(s), Z minute(s) ago"

### Settings Page

- **Last synced**: `formatDate(syncState.lastSyncTime)` — full date/time format
- **Sync now button**: disabled when offline, shows "Offline"

---

## Trail Timestamps

| Location | Source | Meaning |
|---|---|---|
| Home — Starred Trails | `trail.updatedAt` | Last time the trail record was modified (any change: edit, visit added, sync status) |
| Home — Recent Trails | `trail.updatedAt` | Same as above |
| Trail List | Last visit's `timestamp` | When the last page in the trail was first discovered (falls back to `trail.startedAt`) |
| Trail Detail (under title) | `trail.startedAt` | When the trail was first created |

---

## Visit Timestamps (VisitCard)

| Field | Source | Meaning |
|---|---|---|
| Primary timestamp | `visit.timestamp` | When the page was first discovered |
| "Last visited" | `visit.lastVisitedAt` | When the page was last revisited (only shown if different from discovery) |

---

## Date Format Functions

### `formatDate(iso)` — Full date/time
Used on: Home trails, Settings last synced, Trail Detail meta
```
year: "numeric", month: "short", day: "numeric",
hour: "numeric", minute: "2-digit"
```
Example: "Apr 3, 2026, 8:30 PM"

### `formatTime(iso)` — Full date/time (VisitCard)
Extension uses:
```
year: "numeric", month: "long", day: "numeric",
hour: "numeric", minute: "2-digit"
```
Example: "April 3, 2026, 8:30 PM"

PWA uses truncated format (no "Discovered" prefix, no year if current year, "at" instead of comma).

### `formatSyncAge(iso)` — Relative time
Used on: Home sync info
Example: "2 hours, 15 minutes ago"
