<script lang="ts">
  import { onMount } from "svelte";
  import { useLiveQuery } from "$lib/live-query.svelte";
  import { queryTrailData, type TrailData } from "$lib/queries";
  import { db } from "$lib/stores/db";
  import { syncState, syncNow, hasPendingChanges } from "$lib/stores/sync.svelte";
  import { authState } from "$lib/stores/auth.svelte";
  import { installState, reopenInstallPrompt } from "$lib/stores/install.svelte";
  import InstallPrompt from "$lib/components/InstallPrompt.svelte";
  import { runTitleWave, makeLetterColors } from "$lib/utils/title-wave";

  const titleText = "Wikipedia Breadcrumbs";
  const titleLetters = titleText.split("");
  let letterColors = $state(makeLetterColors(titleText));

  async function handleSyncWithWave() {
    await syncNow();
  }

  // Trigger wave when any sync starts (manual or automatic)
  let _prevSyncing = false;
  $effect(() => {
    if (syncState.syncing && !_prevSyncing) {
      runTitleWave(letterColors, (c) => { letterColors = c; });
    }
    _prevSyncing = syncState.syncing;
  });

  const home = useLiveQuery(() => queryTrailData(db), null as TrailData | null);
  const pending = useLiveQuery(() => hasPendingChanges(), false);

  const loaded = $derived(home.current !== null);
  const totalTrails = $derived(home.current?.summaries.length ?? 0);
  const totalVisits = $derived(home.current?.totalVisits ?? 0);
  const totalNotes = $derived(home.current?.totalNotes ?? 0);
  const pendingChanges = $derived(pending.current);

  const starredTrails = $derived.by(() =>
    (home.current?.summaries ?? [])
      .filter((s) => s.trail.isStarred)
      .sort((a, b) => b.trail.updatedAt.localeCompare(a.trail.updatedAt))
      .map((s) => ({ id: s.trail.id, displayName: s.displayName, updatedAt: s.trail.updatedAt }))
  );
  const recentTrails = $derived.by(() =>
    (home.current?.summaries ?? [])
      .filter((s) => !s.trail.isStarred)
      .sort((a, b) => b.trail.updatedAt.localeCompare(a.trail.updatedAt))
      .slice(0, 5)
      .map((s) => ({ id: s.trail.id, displayName: s.displayName, updatedAt: s.trail.updatedAt }))
  );

  const showInstallPrompt = $derived(
    installState.eligible
    && authState.isAuthenticated
    && !!syncState.lastSyncTime
  );

  // On iOS, storage is not shared with the installed PWA, so warn if unsynced
  const needsSyncFirst = $derived(
    showInstallPrompt && !installState.storageShared && pendingChanges
  );

  let isOnline = $state(typeof navigator !== "undefined" ? navigator.onLine : true);

  onMount(() => {
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches
      || (navigator as any).standalone === true;
    if (isStandalone && !localStorage.getItem("installedWavePlayed")) {
      localStorage.setItem("installedWavePlayed", "true");
      runTitleWave(letterColors, (c) => { letterColors = c; });
    }
    const goOnline = () => { isOnline = true; };
    const goOffline = () => { isOnline = false; };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    const tickInterval = setInterval(() => { tick++; }, 60000);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      clearInterval(tickInterval);
    };
  });

  function formatDate(iso: string): string {
    const d = new Date(iso);
    const date = d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return `${date} at ${time}`;
  }

  function formatSyncAge(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const remainHours = hours % 24;
    const remainMinutes = minutes % 60;

    if (days > 0) {
      const parts = [`${days} day${days === 1 ? "" : "s"}`];
      if (remainHours > 0) parts.push(`${remainHours} hour${remainHours === 1 ? "" : "s"}`);
      if (remainMinutes > 0) parts.push(`${remainMinutes} minute${remainMinutes === 1 ? "" : "s"}`);
      return parts.join(", ") + " ago";
    }
    if (hours > 0) {
      const parts = [`${hours} hour${hours === 1 ? "" : "s"}`];
      if (remainMinutes > 0) parts.push(`${remainMinutes} minute${remainMinutes === 1 ? "" : "s"}`);
      return parts.join(", ") + " ago";
    }
    if (minutes > 0) {
      return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    }
    return "just now";
  }

  let tick = $state(0);
  let syncAgeText = $state<string | null>(null);

  $effect(() => {
    const _ = tick;
    syncAgeText = syncState.lastSyncTime ? formatSyncAge(syncState.lastSyncTime) : null;
  });
</script>

{#if loaded}
<div class="fade-in">
<div class="home-header">
  <h1 aria-label="Wikipedia Breadcrumbs"><span aria-hidden="true">{#each titleLetters as letter, i}<span style="color: {letterColors[i]}">{letter}</span>{/each}</span></h1>
  {#if showInstallPrompt && installState.dismissed && !installState.showPromptOverride}
    <button class="install-icon" onclick={reopenInstallPrompt} aria-label="Install app">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
    </button>
  {/if}
</div>

<div class="stats">
  <div class="stat">
    <span class="stat-value">{totalTrails}</span>
    <span class="stat-label">Trails</span>
  </div>
  <div class="stat">
    <span class="stat-value">{totalVisits}</span>
    <span class="stat-label">Pages visited</span>
  </div>
  <div class="stat">
    <span class="stat-value">{totalNotes}</span>
    <span class="stat-label">Notes</span>
  </div>
</div>

{#if showInstallPrompt && (!installState.dismissed || installState.showPromptOverride)}
  <InstallPrompt
    {needsSyncFirst}
    syncing={syncState.syncing}
    {isOnline}
    onSync={handleSyncWithWave}
  />
{/if}

{#if !authState.isAuthenticated}
  <a href="/settings" class="sign-in-prompt">{installState.installed && !installState.storageShared ? "Sign in to restore your trails →" : "Sign in to sync across devices →"}</a>
{:else if syncAgeText}
  {#if !needsSyncFirst}
    <div class="sync-info">
      Last synced {syncAgeText} ·
      {#if isOnline}
        <button class="sync-link" onclick={handleSyncWithWave} disabled={syncState.syncing}>{syncState.syncing ? "Syncing…" : "Sync"}</button>
      {:else}
        <span class="offline">(offline)</span>
      {/if}
    </div>
  {/if}
{:else}
  <div class="sync-info">
    Not yet synced ·
    {#if isOnline}
      <button class="sync-link" onclick={handleSyncWithWave} disabled={syncState.syncing}>{syncState.syncing ? "Syncing…" : "Sync"}</button>
    {:else}
      <span class="offline">(offline)</span>
    {/if}
  </div>
{/if}

{#if starredTrails.length > 0}
  <section class="starred">
    <h2>Starred</h2>
    <ul class="trail-list">
      {#each starredTrails as trail}
        <li>
          <a href="/trails/{trail.id}" class="trail-link">
            <span class="trail-name">★ {trail.displayName}</span>
            <span class="trail-date">{formatDate(trail.updatedAt)}</span>
          </a>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<section class="recent">
  <h2>Recent Trails</h2>
  {#if recentTrails.length === 0 && starredTrails.length === 0}
    <p class="empty">No trails yet. Install the extension to start browsing!</p>
  {:else if recentTrails.length === 0}
    <p class="empty">All trails are starred.</p>
  {:else}
    <ul class="trail-list">
      {#each recentTrails as trail}
        <li>
          <a href="/trails/{trail.id}" class="trail-link">
            <span class="trail-name">{trail.displayName}</span>
            <span class="trail-date">{formatDate(trail.updatedAt)}</span>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
  <a href="/trails" class="see-all">See all trails →</a>
</section>
</div>
{/if}

<style>
  .fade-in { animation: fadeIn 0.1s ease-in; }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  h1 { font-size: 22px; font-weight: 700; margin: 0; }
  h2 { font-size: 16px; font-weight: 600; margin: 0 0 12px; }

  .stats {
    display: flex;
    gap: 12px;
    margin-bottom: 12px;
  }
  .stat {
    flex: 1;
    background: #f5f5f5;
    border-radius: 10px;
    padding: 12px 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .stat-value { font-size: 18px; font-weight: 700; word-break: break-all; text-align: center; }
  .stat-label { font-size: 11px; color: #666; text-align: center; }

  .sync-info {
    text-align: center;
    font-size: 13px;
    color: #888;
    padding: 8px;
    margin-bottom: 8px;
  }
  .sync-link {
    background: none;
    border: none;
    color: #0066cc;
    cursor: pointer;
    font-size: 13px;
    padding: 0;
  }
  .sync-link:hover { text-decoration: underline; }
  .sync-link:disabled { color: #999; cursor: default; text-decoration: none; }
  .offline { color: #999; font-style: italic; }

  .starred { margin-bottom: 16px; }
  .recent { }
  .trail-list { list-style: none; margin: 0 0 12px; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  .trail-link {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    background: #fafafa;
    border: 1px solid #ebebeb;
    border-radius: 8px;
    text-decoration: none;
    color: inherit;
    gap: 8px;
  }
  .trail-link:hover { background: #f0f0f0; }
  .trail-name { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .trail-date { font-size: 11px; color: #888; flex-shrink: 0; }

  .empty { color: #767676; font-size: 13px; margin: 0 0 12px; }
  .see-all { font-size: 13px; color: #0066cc; text-decoration: none; }
  .see-all:hover { text-decoration: underline; }
  .home-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
  .home-header h1 { margin: 0; }
  .install-icon { background: none; border: none; color: #0066cc; cursor: pointer; padding: 4px; }
  .install-icon:hover { color: #0052a3; }
  .sign-in-prompt { display: block; text-align: center; padding: 8px; color: #0066cc; text-decoration: none; font-size: 13px; margin-bottom: 8px; }
</style>
