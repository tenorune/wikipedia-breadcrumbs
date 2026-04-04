# Custom PWA Install Prompt Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a custom install prompt on the PWA home page after the user has signed in, synced, and viewed a trail, adapting to Android (native install) and iOS (share instructions).

**Architecture:** A reactive install store captures `beforeinstallprompt` and tracks eligibility. An `InstallPrompt` component renders inline on the home page. The trail detail route sets a `hasViewedTrail` flag. A download icon in the home header appears after dismissal.

**Tech Stack:** SvelteKit, Svelte 5 (runes), localStorage, `beforeinstallprompt` API

**Spec:** `docs/superpowers/specs/2026-04-05-pwa-install-prompt-design.md`

---

## File Structure

**Create:**
- `packages/pwa/src/lib/stores/install.svelte.ts` — reactive store: captures `beforeinstallprompt`, detects iOS, evaluates eligibility, manages dismissal state
- `packages/pwa/src/lib/components/InstallPrompt.svelte` — inline install card with platform-adaptive content

**Modify:**
- `packages/pwa/src/routes/+layout.svelte` — initialize install store on mount
- `packages/pwa/src/routes/+page.svelte` — render InstallPrompt and header icon
- `packages/pwa/src/routes/trails/[id]/+page.svelte` — set `hasViewedTrail` on mount

---

## Chunk 1: Install Store

### Task 1: Install Store

**Files:**
- Create: `packages/pwa/src/lib/stores/install.svelte.ts`

- [ ] **Step 1: Create the install store**

Create `packages/pwa/src/lib/stores/install.svelte.ts`:

```typescript
let _deferredPrompt: any = null;
let _promptFired = $state(false);
let _installed = $state(false);
let _dismissed = $state(false);
let _showPromptOverride = $state(false);
let _hasViewedTrail = $state(false);
let _isIOS = false;
let _isStandalone = false;

export function initInstallStore() {
  if (typeof window === "undefined") return;

  // Read localStorage (safe — only called client-side)
  _dismissed = localStorage.getItem("installPromptState") === "dismissed";
  _hasViewedTrail = localStorage.getItem("hasViewedTrail") === "true";

  // Detect iOS Safari (excludes CriOS/FxiOS which can't install PWAs)
  _isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    && !(window as any).MSStream
    && /Safari/.test(navigator.userAgent)
    && !/CriOS|FxiOS/.test(navigator.userAgent);

  // Detect if already installed
  _isStandalone = window.matchMedia("(display-mode: standalone)").matches
    || (navigator as any).standalone === true;

  window.addEventListener("beforeinstallprompt", (e: Event) => {
    e.preventDefault();
    _deferredPrompt = e;
    _promptFired = true;
  });

  window.addEventListener("appinstalled", () => {
    _installed = true;
    _deferredPrompt = null;
  });
}

export function markTrailViewed() {
  _hasViewedTrail = true;
  localStorage.setItem("hasViewedTrail", "true");
}

export const installState = {
  get eligible(): boolean {
    if (_isStandalone || _installed) return false;
    if (!_hasViewedTrail) return false;
    return _promptFired || _isIOS;
  },
  get platform(): "android" | "ios" | null {
    if (_promptFired) return "android";
    if (_isIOS) return "ios";
    return null;
  },
  get dismissed(): boolean {
    return _dismissed;
  },
  get installed(): boolean {
    return _installed || _isStandalone;
  },
  get showPromptOverride(): boolean {
    return _showPromptOverride;
  },
};

export function dismissInstallPrompt() {
  _dismissed = true;
  _showPromptOverride = false;
  localStorage.setItem("installPromptState", "dismissed");
}

export function reopenInstallPrompt() {
  _showPromptOverride = true;
}

export async function triggerInstall() {
  if (_deferredPrompt) {
    await _deferredPrompt.prompt();
    const { outcome } = await _deferredPrompt.userChoice;
    if (outcome === "accepted") {
      _installed = true;
    }
    _deferredPrompt = null;
  }
}
```

- [ ] **Step 2: Build to verify no errors**

Run: `pnpm --filter pwa build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add packages/pwa/src/lib/stores/install.svelte.ts
git commit -m "feat: add PWA install store with beforeinstallprompt and iOS detection"
```

---

## Chunk 2: Engagement Tracking + Layout Init

### Task 2: Set hasViewedTrail in trail detail

**Files:**
- Modify: `packages/pwa/src/routes/trails/[id]/+page.svelte`

- [ ] **Step 1: Add hasViewedTrail flag on mount**

Replace the full content of `packages/pwa/src/routes/trails/[id]/+page.svelte`:

```svelte
<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import TrailDetail from "$lib/components/TrailDetail.svelte";
  import { markTrailViewed } from "$lib/stores/install.svelte";

  onMount(() => {
    markTrailViewed();
  });
</script>

<TrailDetail trailId={$page.params.id} onBack={() => goto("/trails")} />
```

- [ ] **Step 2: Build to verify**

Run: `pnpm --filter pwa build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add packages/pwa/src/routes/trails/[id]/+page.svelte
git commit -m "feat: track hasViewedTrail for install prompt eligibility"
```

---

### Task 3: Initialize install store in layout

**Files:**
- Modify: `packages/pwa/src/routes/+layout.svelte`

- [ ] **Step 1: Add initInstallStore call**

In `packages/pwa/src/routes/+layout.svelte`:

Add the import after the existing imports at the top of the `<script>` block:

```typescript
import { initInstallStore } from "$lib/stores/install.svelte";
```

Inside the existing `onMount(async () => { ... })` callback, add `initInstallStore()` as the very first line, before `await initAuth()`. The result should look like:

```typescript
onMount(async () => {
  initInstallStore();       // ← add this line
  await initAuth();         // existing
  // ... rest of existing code
});
```

- [ ] **Step 2: Build to verify**

Run: `pnpm --filter pwa build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add packages/pwa/src/routes/+layout.svelte
git commit -m "feat: initialize install store in PWA layout"
```

---

## Chunk 3: Install Prompt UI

### Task 4: InstallPrompt Component

**Files:**
- Create: `packages/pwa/src/lib/components/InstallPrompt.svelte`

- [ ] **Step 1: Create the component**

Create `packages/pwa/src/lib/components/InstallPrompt.svelte`:

```svelte
<script lang="ts">
  import { installState, dismissInstallPrompt, triggerInstall } from "$lib/stores/install.svelte";

  let showIosSteps = $state(false);
</script>

<div class="install-card">
  <button class="dismiss" onclick={dismissInstallPrompt} aria-label="Dismiss install prompt">&times;</button>
  <p class="install-text">Install Wikipedia Breadcrumbs for quick access from your home screen</p>
  {#if installState.platform === "android"}
    <button class="install-btn" onclick={triggerInstall}>Install</button>
  {:else if installState.platform === "ios"}
    {#if showIosSteps}
      <p class="ios-steps">
        Tap the share icon
        <svg class="share-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
        then "Add to Home Screen"
      </p>
    {:else}
      <button class="install-btn" onclick={() => { showIosSteps = true; }}>How to install</button>
    {/if}
  {/if}
</div>

<style>
  .install-card {
    position: relative;
    background: #f8f9fa;
    border-radius: 10px;
    padding: 16px 20px;
    margin-bottom: 16px;
  }
  .dismiss {
    position: absolute;
    top: 8px;
    right: 12px;
    background: none;
    border: none;
    font-size: 18px;
    color: #999;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }
  .dismiss:hover { color: #666; }
  .install-text {
    font-size: 14px;
    margin: 0 0 12px;
    padding-right: 20px;
  }
  .install-btn {
    background: #0066cc;
    color: white;
    border: none;
    border-radius: 6px;
    padding: 8px 20px;
    font-size: 14px;
    cursor: pointer;
  }
  .install-btn:hover { background: #0052a3; }
  .ios-steps {
    font-size: 13px;
    color: #666;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
  }
  .share-icon { vertical-align: middle; flex-shrink: 0; }
</style>
```

- [ ] **Step 2: Build to verify**

Run: `pnpm --filter pwa build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add packages/pwa/src/lib/components/InstallPrompt.svelte
git commit -m "feat: add InstallPrompt component with Android/iOS support"
```

---

### Task 5: Integrate into Home Page

**Files:**
- Modify: `packages/pwa/src/routes/+page.svelte`

- [ ] **Step 1: Add imports**

In `packages/pwa/src/routes/+page.svelte`, add these imports after the existing imports (after line 7):

```typescript
import { installState, reopenInstallPrompt } from "$lib/stores/install.svelte";
import InstallPrompt from "$lib/components/InstallPrompt.svelte";
```

- [ ] **Step 2: Add eligibility check**

Add a derived value after the existing state declarations (after line 17):

```typescript
const showInstallPrompt = $derived(
  installState.eligible
  && authState.isAuthenticated
  && !!syncState.lastSyncTime
);
```

- [ ] **Step 3: Add header icon and inline prompt to template**

In the template, replace the `<h1>` line (line 122):

```svelte
<div class="home-header">
  <h1>Wikipedia Breadcrumbs</h1>
  {#if showInstallPrompt && installState.dismissed && !installState.showPromptOverride}
    <button class="install-icon" onclick={reopenInstallPrompt} aria-label="Install app">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
    </button>
  {/if}
</div>
```

Then add the install prompt after the stats section (after the closing `</div>` of `.stats`, around line 137), before the auth/sync info block:

```svelte
{#if showInstallPrompt && (!installState.dismissed || installState.showPromptOverride)}
  <InstallPrompt />
{/if}
```

- [ ] **Step 4: Add CSS for header**

Add to the `<style>` block:

```css
.home-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.home-header h1 { margin: 0; }
.install-icon { background: none; border: none; color: #0066cc; cursor: pointer; padding: 4px; }
.install-icon:hover { color: #0052a3; }
```

Remove the existing `h1` margin rule (`h1 { font-size: 22px; font-weight: 700; margin: 0 0 20px; }`) and update to:

```css
h1 { font-size: 22px; font-weight: 700; margin: 0; }
```

- [ ] **Step 5: Build to verify**

Run: `pnpm --filter pwa build`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add packages/pwa/src/routes/+page.svelte
git commit -m "feat: integrate install prompt and header icon on home page"
```

---

### Task 6: Final Verification

- [ ] **Step 1: Build the full PWA**

Run: `pnpm --filter pwa build`
Expected: Build succeeds.

- [ ] **Step 2: Run shared tests to confirm nothing broke**

Run: `cd packages/shared && node_modules/.bin/vitest run`
Expected: All tests pass.

- [ ] **Step 3: Commit any cleanup if needed**

Only commit if there are unstaged changes. Use specific file paths.
