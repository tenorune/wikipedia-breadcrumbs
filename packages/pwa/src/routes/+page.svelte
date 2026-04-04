<script lang="ts">
  import { onMount } from "svelte";
  import { trailStore, visitStore } from "@wikipedia-breadcrumbs/shared";
  import type { Trail } from "@wikipedia-breadcrumbs/shared";
  import { db } from "$lib/stores/db";
  import { syncState, syncNow } from "$lib/stores/sync.svelte";
  import { authState } from "$lib/stores/auth.svelte";
  import { installState, reopenInstallPrompt } from "$lib/stores/install.svelte";
  import InstallPrompt from "$lib/components/InstallPrompt.svelte";

  const ts = trailStore(db);
  const vs = visitStore(db);

  let loaded = $state(false);
  let totalTrails = $state(0);
  let totalVisits = $state(0);
  let totalNotes = $state(0);
  let starredTrails = $state<Array<{ id: string; displayName: string; updatedAt: string }>>([]);
  let recentTrails = $state<Array<{ id: string; displayName: string; updatedAt: string }>>([]);

  const showInstallPrompt = $derived(
    installState.eligible
    && authState.isAuthenticated
    && !!syncState.lastSyncTime
  );

  async function loadData() {
    const [trails, allVisits] = await Promise.all([
      ts.getAll(),
      db.visits.filter((v) => v.deletedAt === null).toArray(),
    ]);
    totalTrails = trails.length;
    totalVisits = allVisits.length;

    // Count notes: trail notes + visit notes
    const trailNoteCount = trails.filter((t) => t.note).length;
    const visitNoteCount = allVisits.filter((v) => v.note).length;
    totalNotes = trailNoteCount + visitNoteCount;

    // Build display names for all trails
    async function buildItem(t: Trail) {
      let displayName = t.name;
      if (!displayName) {
        const visits = await vs.getByTrailId(t.id);
        if (visits.length > 0) {
          displayName = visits.length === 1
            ? visits[0].title
            : `${visits[0].title} → ${visits[visits.length - 1].title}`;
        } else {
          displayName = "Empty trail";
        }
      }
      return { id: t.id, displayName, updatedAt: t.updatedAt };
    }

    // Starred trails
    const starred = trails.filter((t) => t.isStarred);
    const starredIds = new Set(starred.map((t) => t.id));
    starredTrails = await Promise.all(starred.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(buildItem));

    // Recent trails (excluding starred)
    const nonStarred = trails.filter((t) => !starredIds.has(t.id));
    const sorted = nonStarred.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);
    recentTrails = await Promise.all(sorted.map(buildItem));
    loaded = true;
  }

  let isOnline = $state(typeof navigator !== "undefined" ? navigator.onLine : true);

  onMount(() => {
    loadData();
    const onVisible = () => { if (document.visibilityState === "visible") loadData(); };
    const goOnline = () => { isOnline = true; };
    const goOffline = () => { isOnline = false; };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    const tickInterval = setInterval(() => { tick++; }, 60000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
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
  <h1>Wikipedia Breadcrumbs</h1>
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
  <InstallPrompt />
{/if}

{#if !authState.isAuthenticated}
  <a href="/settings" class="sign-in-prompt">Sign in to sync across devices →</a>
{:else if syncAgeText}
  <div class="sync-info">
    Last synced {syncAgeText} ·
    {#if isOnline}
      <button class="sync-link" onclick={syncNow} disabled={syncState.syncing}>{syncState.syncing ? "Syncing…" : "Sync"}</button>
    {:else}
      <span class="offline">(offline)</span>
    {/if}
  </div>
{:else}
  <div class="sync-info">
    Not yet synced ·
    {#if isOnline}
      <button class="sync-link" onclick={syncNow} disabled={syncState.syncing}>{syncState.syncing ? "Syncing…" : "Sync"}</button>
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
  .sync-link:disabled { color: #999; cursor: default; }
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
