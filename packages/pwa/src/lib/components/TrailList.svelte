<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { trailStore, visitStore } from "@wikipedia-breadcrumbs/shared";
  import type { Trail } from "@wikipedia-breadcrumbs/shared";
  import { db } from "$lib/stores/db";

  const ts = trailStore(db);
  const vs = visitStore(db);

  type SortMode = "recent" | "oldest" | "starred";

  let trails = $state<Trail[]>([]);
  let displayNames = $state<Record<string, string>>({});
  let searchTexts = $state<Record<string, string>>({});
  let search = $state("");
  let sortMode = $state<SortMode>("recent");

  async function loadTrails() {
    const all = await ts.getAll();
    trails = all;
    const names: Record<string, string> = {};
    const texts: Record<string, string> = {};
    await Promise.all(
      all.map(async (t) => {
        const visits = await vs.getByTrailId(t.id);
        if (t.name) {
          names[t.id] = t.name;
        } else if (visits.length === 0) {
          names[t.id] = "Empty trail";
        } else if (visits.length === 1) {
          names[t.id] = visits[0].title;
        } else {
          names[t.id] = `${visits[0].title} → ${visits[visits.length - 1].title}`;
        }
        // Build searchable text from trail name, note, and all visit titles/notes
        const parts = [t.name ?? "", t.note ?? ""];
        for (const v of visits) {
          parts.push(v.title, v.note ?? "");
        }
        texts[t.id] = parts.join(" ").toLowerCase();
      })
    );
    displayNames = names;
    searchTexts = texts;
  }

  onMount(() => {
    loadTrails();
    const onVisible = () => { if (document.visibilityState === "visible") loadTrails(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  });

  const filtered = $derived.by(() => {
    const q = search.trim().toLowerCase();
    let list = trails.filter((t) => {
      if (!q) return true;
      return (searchTexts[t.id] ?? "").includes(q);
    });

    if (sortMode === "recent") {
      list = [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    } else if (sortMode === "oldest") {
      list = [...list].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    } else if (sortMode === "starred") {
      list = [...list].sort((a, b) => {
        if (a.isStarred === b.isStarred) return b.updatedAt.localeCompare(a.updatedAt);
        return a.isStarred ? -1 : 1;
      });
    }
    return list;
  });

  async function toggleStar(trail: Trail, e: Event) {
    e.stopPropagation();
    await ts.update(trail.id, { isStarred: !trail.isStarred });
    await loadTrails();
  }

  async function deleteTrail(trail: Trail, e: Event) {
    e.stopPropagation();
    if (!confirm(`Delete "${displayNames[trail.id] ?? "this trail"}"?`)) return;
    await ts.softDelete(trail.id);
    await loadTrails();
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric",
    });
  }

  import { TrailStatus } from "@wikipedia-breadcrumbs/shared";
</script>

<div class="controls">
  <input
    class="search"
    type="search"
    placeholder="Search trails…"
    bind:value={search}
  />
  <select class="sort" bind:value={sortMode}>
    <option value="recent">Most Recent</option>
    <option value="oldest">Oldest</option>
    <option value="starred">Starred</option>
  </select>
</div>

{#if filtered.length === 0}
  <p class="empty">{search ? "No trails match your search." : "No trails yet."}</p>
{:else}
  <ul class="list">
    {#each filtered as trail (trail.id)}
      <li class="item">
        <button
          class="star"
          class:starred={trail.isStarred}
          onclick={(e) => toggleStar(trail, e)}
          title={trail.isStarred ? "Unstar" : "Star"}
          aria-label={trail.isStarred ? "Unstar trail" : "Star trail"}
        >
          {trail.isStarred ? "★" : "☆"}
        </button>

        <button class="info" onclick={() => goto("/trails/" + trail.id)}>
          <span class="name">{displayNames[trail.id] ?? "…"}</span>
          <span class="meta">
            {formatDate(trail.updatedAt)}
            {#if trail.status === TrailStatus.Active}
              <span class="badge active">Active</span>
            {/if}
          </span>
        </button>

        <button
          class="delete"
          onclick={(e) => deleteTrail(trail, e)}
          title="Delete trail"
          aria-label="Delete trail"
        >
          ✕
        </button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .controls {
    display: flex;
    gap: 8px;
    margin-bottom: 14px;
  }
  .search {
    flex: 1;
    padding: 8px 10px;
    border: 1px solid #ddd;
    border-radius: 8px;
    font-size: 14px;
    outline: none;
  }
  .search:focus { border-color: #0066cc; }
  .sort {
    padding: 8px 10px;
    border: 1px solid #ddd;
    border-radius: 8px;
    font-size: 14px;
    background: white;
  }

  .empty { color: #888; font-size: 13px; }

  .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  .item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: #fafafa;
    border: 1px solid #ebebeb;
    border-radius: 8px;
    cursor: pointer;
  }
  .item:hover { background: #f0f0f0; }

  .star {
    background: none;
    border: none;
    font-size: 18px;
    cursor: pointer;
    padding: 0 2px;
    color: #ccc;
    flex-shrink: 0;
  }
  .star.starred { color: #f5a623; }

  .info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow: hidden;
    background: none;
    border: none;
    font: inherit;
    color: inherit;
    cursor: pointer;
    padding: 0;
    text-align: left;
  }
  .name { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .meta { font-size: 11px; color: #888; display: flex; align-items: center; gap: 6px; }

  .badge {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 10px;
    font-weight: 600;
  }
  .badge.active { background: #d4f0d4; color: #2a7a2a; }

  .delete {
    background: none;
    border: none;
    color: #bbb;
    cursor: pointer;
    font-size: 14px;
    padding: 2px 4px;
    flex-shrink: 0;
  }
  .delete:hover { color: #cc3300; }
</style>
