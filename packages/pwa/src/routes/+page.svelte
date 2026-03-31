<script lang="ts">
  import { onMount } from "svelte";
  import { trailStore, visitStore } from "@wikipedia-breadcrumbs/shared";
  import { db } from "$lib/stores/db";
  import { syncState } from "$lib/stores/sync.svelte";
  import { authState } from "$lib/stores/auth.svelte";

  const ts = trailStore(db);
  const vs = visitStore(db);

  let totalTrails = $state(0);
  let totalVisits = $state(0);
  let recentTrails = $state<Array<{ id: string; displayName: string; updatedAt: string }>>([]);

  async function loadData() {
    const [trails, allVisits] = await Promise.all([
      ts.getAll(),
      db.visits.filter((v) => v.deletedAt === null).toArray(),
    ]);
    totalTrails = trails.length;
    totalVisits = allVisits.length;
    const sorted = [...trails].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);
    const items = await Promise.all(
      sorted.map(async (t) => {
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
      })
    );
    recentTrails = items;
  }

  onMount(() => {
    loadData();
    const onVisible = () => { if (document.visibilityState === "visible") loadData(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  });

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  }
</script>

<h1>Wikipedia Breadcrumbs</h1>

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
    <span class="stat-value">{syncState.lastSyncTime ? formatDate(syncState.lastSyncTime) : "Never"}</span>
    <span class="stat-label">Last synced</span>
  </div>
</div>

{#if !authState.isAuthenticated}
  <a href="/settings" class="sign-in-prompt">Sign in to sync across devices →</a>
{/if}

<section class="recent">
  <h2>Recent Trails</h2>
  {#if recentTrails.length === 0}
    <p class="empty">No trails yet. Install the extension to start browsing!</p>
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

<style>
  h1 { font-size: 22px; font-weight: 700; margin: 0 0 20px; }
  h2 { font-size: 16px; font-weight: 600; margin: 0 0 12px; }

  .stats {
    display: flex;
    gap: 12px;
    margin-bottom: 28px;
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

  .empty { color: #888; font-size: 13px; margin: 0 0 12px; }
  .see-all { font-size: 13px; color: #0066cc; text-decoration: none; }
  .see-all:hover { text-decoration: underline; }
  .sign-in-prompt { display: block; text-align: center; padding: 8px; color: #0066cc; text-decoration: none; font-size: 13px; margin-top: 12px; }
</style>
