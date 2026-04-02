# Trail Lifecycle Design Spec

How trails transition between active and finalized states.

---

## States

A trail has two statuses: **Active** or **Finalized** (`packages/shared/src/models/enums.ts`).

There is also a critical piece of ephemeral state: whether the trail is **registered in the in-memory `TrailManager`** (`packages/extension/src/background/trail-manager.ts`), a `Map<tabId, ActiveTrailEntry>`. This in-memory state is lost whenever the service worker terminates (~5 min idle) or the extension reloads.

---

## What Makes a Trail Active

A trail is created as `status: "active"` when `shouldStartNewTrail()` returns true (`packages/shared/src/trail/detection.ts`). Detection runs on every Wikipedia navigation (`webNavigation.onCommitted`) and checks these conditions **in order, first match wins**:

| Condition | Start Reason | What it means |
|---|---|---|
| No trail in memory for any tab | `auto_new_tab` | Fresh session or SW restarted and recovery failed |
| Navigation tab != trail's tab | `auto_new_tab` | User opened Wikipedia in a different tab |
| Tab flagged as new | `auto_new_tab` | Brand new tab |
| Time since last visit >= idle timeout | `auto_timeout` | User went idle, then came back |
| Navigated to Main Page | `auto_main_page` | Main Page is a natural "starting over" point |
| Navigation from Wikipedia search | `auto_search` | Search represents an intentional topic change |
| External referrer + non-link transition | `auto_external` | Typed URL, bookmark, address bar |
| *(none of the above)* | *(continue existing trail)* | Normal Wikipedia link navigation |

---

## What Finalizes a Trail

Finalization sets `status: "finalized"` and `endedAt: now` (`packages/shared/src/db/trails.ts`). It happens on:

1. **Tab closed** — `chrome.tabs.onRemoved` listener
2. **Tab replaced** — `chrome.tabs.onReplaced` listener (prerender)
3. **Window closed** — `chrome.windows.onRemoved` finalizes all trails in that window
4. **Manual "End Trail"** — user action from the popup/UI
5. **Starting a new trail on the same tab** — the old trail is finalized first
6. **Idle timeout alarm fires** — trail is finalized in the DB and cleared from memory
7. **Staleness check** — during periodic reconciliation (every 15 min), active trails not in memory whose `updatedAt` is older than 2x the idle timeout are finalized

---

## Idle Timeout

The timeout (default 30 min, user-configurable) creates a Chrome alarm `idle-tab-{tabId}`. The alarm resets on every navigation (`packages/extension/src/background/alarm-manager.ts`). When it fires:

1. The trail is **finalized** in the database (`status: "finalized"`, `endedAt: now`)
2. The trail is removed from in-memory `TrailManager`
3. The idle alarm is cleared

If the user returns to Wikipedia in that tab, `shouldStartNewTrail()` will see no current trail and start a fresh one.

---

## Trail Recovery

When `handleNavigation` fires and finds no in-memory trail for the tab, it tries to recover (`packages/extension/src/background/capture.ts`):

1. **By tabId** — ask the DB for an active trail associated with this tabId
2. **By URL** — ask the DB for an active trail whose last visit matches this URL

If recovery succeeds, the old trail's data populates `current`, and then `shouldStartNewTrail()` runs with `msSinceLastVisit` computed from the recovered trail's last timestamp.

The flow in `capture.ts` is:

```
1. Try in-memory lookup
2. If not found, try DB recovery → sets `current`
3. Build detection context using `current` (which may now be the recovered trail)
4. Call shouldStartNewTrail(context)
5. If detection says new OR current is still null → create new trail
6. Otherwise → continue on recovered trail
```

Since idle timeout now finalizes trails, recovery will only find trails that are genuinely still active (the user navigated recently but the service worker restarted).

---

## What Reactivates a Trail

A finalized trail can be reactivated via:

1. **"Resume" action from UI** (`resumeTrailInNewTab`) — sets `status: "active"`, `endedAt: null`, creates a new tab, registers in `TrailManager`
2. **"Navigate" to a trail's page** (`navigateActiveTrail`) — if the trail isn't in memory, does the same reactivation as resume
3. **Split trail** — creates a new active trail from the split portion, and may resume the new trail in a new tab

---

## Reconciliation on Startup

`reconcileActiveTrails()` runs ~6 seconds after extension startup and then every 15 minutes (`packages/extension/src/background/index.ts`). It:

1. Gets all `status: "active"` trails from the DB
2. Gets all open Wikipedia tabs
3. Tries to match each trail to a tab by: last visit URL → articleId substring → any visit URL
4. Matched trails get re-registered in `TrailManager` with the new tabId
5. Unmatched trails with `updatedAt` older than 2x the idle timeout are finalized (staleness check)

The staleness check catches trails orphaned by browser restarts where tabs weren't restored — they'll be finalized once their `updatedAt` exceeds 2x the idle timeout. A separate one-shot orphan alarm was considered but rejected: the service worker restarts frequently, and each restart creates a fresh empty `TrailManager`, so a short-delay orphan check would incorrectly finalize active trails.

---

## State Diagram

```
                    ┌─────────────┐
     Navigation ───►│   ACTIVE    │◄─── Resume/Navigate from UI
     (new trail)    │ (in DB +    │
                    │  memory)    │
                    └──────┬──────┘
                           │
         ┌─────────┬───────┼────────┬──────────────┐
         │         │       │        │              │
    Tab close  Window   Manual   Idle alarm   Orphan/stale
    Tab replace close   "End"    fires        cleanup
         │         │       │        │              │
         ▼         ▼       ▼        ▼              ▼
                    ┌─────────────┐
                    │  FINALIZED  │
                    │ (in DB)     │
                    └─────────────┘
```

---

## Edge Cases

| Scenario | Behavior |
|---|---|
| User goes idle, returns after timeout | Trail was finalized by idle alarm; new trail starts |
| SW terminated, user returns | Recovery finds active trail in DB, detection re-evaluates timeout |
| Browser restart, tabs restored | Reconciliation matches trails to new tab IDs |
| Browser restart, tabs NOT restored | Staleness check finalizes after 2x idle timeout |
| Tab closed while SW is asleep | Periodic reconciliation (every 15 min) catches stale trails |
| Same article in two tabs | URL-based recovery could match the wrong trail (known limitation) |
| User navigates to Main Page | Current trail finalized, new trail starts |
| User uses Wikipedia search | Current trail finalized, new trail starts |
