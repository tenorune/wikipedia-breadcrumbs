<script lang="ts">
  import type { BreadcrumbsDB } from "@wikipedia-breadcrumbs/shared";
  import { exportTrailsJson, exportTrailsCsv, downloadFile, exportFilename } from "@wikipedia-breadcrumbs/shared";
  import ImportDialog from "./ImportDialog.svelte";
  import ConfirmDialog from "./ConfirmDialog.svelte";
  import type { TrailSummary } from "./types.js";

  interface Props {
    db: BreadcrumbsDB;
    getDeviceId: () => Promise<string>;
    summaries: TrailSummary[];
    onSelectTrail: (summary: TrailSummary) => void;
    onToggleStar: (summary: TrailSummary) => void;
    onDeleteTrail: (summary: TrailSummary) => void;
    onImported?: () => void;
  }

  let { db, getDeviceId, summaries, onSelectTrail, onToggleStar, onDeleteTrail, onImported }: Props = $props();

  type SortMode = "recent" | "oldest" | "starred";

  let search = $state("");
  let sortMode = $state<SortMode>("recent");
  let sortDropdownOpen = $state(false);

  const sortLabels: Record<SortMode, string> = { recent: "Most Recent", oldest: "Oldest", starred: "Starred" };

  $effect(() => {
    if (!sortDropdownOpen) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".sort-dropdown-wrap")) sortDropdownOpen = false;
    };
    setTimeout(() => document.addEventListener("click", close));
    return () => document.removeEventListener("click", close);
  });

  const filtered = $derived.by(() => {
    const q = search.trim().toLowerCase();
    let list = summaries.filter((s) => !q || s.searchText.includes(q));

    if (sortMode === "recent") {
      list = [...list].sort((a, b) => b.trail.updatedAt.localeCompare(a.trail.updatedAt));
    } else if (sortMode === "oldest") {
      list = [...list].sort((a, b) => a.trail.startedAt.localeCompare(b.trail.startedAt));
    } else if (sortMode === "starred") {
      list = [...list].sort((a, b) => {
        if (a.trail.isStarred === b.trail.isStarred) return b.trail.updatedAt.localeCompare(a.trail.updatedAt);
        return a.trail.isStarred ? -1 : 1;
      });
    }
    return list;
  });

  function toggleStar(summary: TrailSummary, e: Event) {
    e.stopPropagation();
    onToggleStar(summary);
  }

  let confirmState = $state<{ message: string; action: () => void } | null>(null);

  function deleteTrail(summary: TrailSummary, e: Event) {
    e.stopPropagation();
    confirmState = {
      message: `Delete "${summary.displayName}"?`,
      action: () => onDeleteTrail(summary),
    };
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric", month: "long", day: "numeric",
    });
  }

  // Data menu (import/export)
  let dataMenuOpen = $state(false);

  $effect(() => {
    if (!dataMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".data-menu-wrap")) dataMenuOpen = false;
    };
    setTimeout(() => document.addEventListener("click", close));
    return () => document.removeEventListener("click", close);
  });

  let importer: { start: () => Promise<void> } | undefined = $state();

  async function handleExport(format: "json" | "csv") {
    dataMenuOpen = false;
    const content = format === "json"
      ? await exportTrailsJson(db)
      : await exportTrailsCsv(db);
    downloadFile(content, exportFilename(null, format), format === "json" ? "application/json" : "text/csv");
  }
</script>

<div class="controls">
  <input
    class="search"
    type="search"
    placeholder="Search trails…"
    bind:value={search}
  />
  <div class="sort-dropdown-wrap">
    <button class="sort-dropdown-btn" onclick={() => { sortDropdownOpen = !sortDropdownOpen; }}>
      <span>{sortLabels[sortMode]}</span>
      <span class="sort-dropdown-arrow" aria-hidden="true">▾</span>
    </button>
    {#if sortDropdownOpen}
      <div class="sort-dropdown">
        {#each (["recent", "oldest", "starred"] as SortMode[]) as mode}
          <button class:selected={sortMode === mode} onclick={() => { sortMode = mode; sortDropdownOpen = false; }}>{sortLabels[mode]}</button>
        {/each}
      </div>
    {/if}
  </div>
  <div class="data-menu-wrap">
    <button class="data-menu-btn" onclick={() => { dataMenuOpen = !dataMenuOpen; }} title="Import / Export" aria-label="Import / Export">⋮</button>
    {#if dataMenuOpen}
      <div class="data-menu">
        <button onclick={() => { dataMenuOpen = false; importer?.start(); }}>Import</button>
        <button onclick={() => handleExport("json")}>Export JSON</button>
        <button onclick={() => handleExport("csv")}>Export CSV</button>
      </div>
    {/if}
  </div>
</div>

<ImportDialog bind:this={importer} {db} {getDeviceId} onComplete={onImported} />

{#if filtered.length === 0}
  <p class="empty">{search ? "No trails match your search." : "No trails yet."}</p>
{:else}
  <ul class="list">
    {#each filtered as summary (summary.trail.id)}
      <li class="item">
        <button
          class="star"
          class:starred={summary.trail.isStarred}
          onclick={(e) => toggleStar(summary, e)}
          title={summary.trail.isStarred ? "Unstar" : "Star"}
          aria-label={summary.trail.isStarred ? "Unstar trail" : "Star trail"}
        >
          {summary.trail.isStarred ? "★" : "☆"}
        </button>

        <button class="info" onclick={() => onSelectTrail(summary)}>
          <span class="name">{summary.displayName}</span>
          <span class="meta">
            {summary.visitCount} pages &middot; {formatDate(summary.trail.startedAt)}{#if formatDate(summary.trail.startedAt) !== formatDate(summary.lastDiscovered)}{" "}&mdash; {formatDate(summary.lastDiscovered)}{/if}
            {#if summary.trail.status === "active"}
              <span class="active-badge">Active</span>
            {/if}
          </span>
        </button>

        <button
          class="delete"
          onclick={(e) => deleteTrail(summary, e)}
          title="Delete trail"
          aria-label="Delete trail"
        >
          ✕
        </button>
      </li>
    {/each}
  </ul>
{/if}

{#if confirmState}
  <ConfirmDialog
    message={confirmState.message}
    confirmLabel="Delete"
    onConfirm={() => { confirmState!.action(); confirmState = null; }}
    onCancel={() => { confirmState = null; }}
  />
{/if}

<style>
  .controls {
    display: flex;
    gap: 8px;
    margin-bottom: 14px;
    align-items: stretch;
  }
  .search {
    flex: 1;
    padding: 8px 10px;
    border: 1px solid #ddd;
    border-radius: 8px;
    font-size: 14px;
    outline: none;
    box-sizing: border-box;
  }
  .search:focus { border-color: #0066cc; }
  .sort-dropdown-wrap { position: relative; display: flex; }
  .sort-dropdown-btn {
    padding: 8px 10px; border: 1px solid #ddd; border-radius: 8px;
    font-size: 13px; background: white; cursor: pointer; box-sizing: border-box;
    display: flex; align-items: center; gap: 6px; white-space: nowrap; height: 100%;
  }
  .sort-dropdown-btn:hover { border-color: #bbb; }
  .sort-dropdown-arrow { color: #555; }
  .sort-dropdown {
    position: absolute; top: calc(100% + 4px); left: 0; background: white;
    border: 1px solid #ddd; border-radius: 8px; padding: 4px 0; z-index: 50;
    min-width: 140px; box-shadow: 0 4px 12px rgba(0,0,0,0.12);
  }
  .sort-dropdown button {
    display: block; width: 100%; text-align: left; padding: 8px 14px;
    border: none; background: none; cursor: pointer; font-size: 13px; color: #222;
  }
  .sort-dropdown button:hover { background: #f5f5f5; }
  .sort-dropdown button.selected { background: #e8f0fe; color: #0066cc; }

  .empty { color: #767676; font-size: 13px; }

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
  .meta { font-size: 11px; color: #888; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .active-badge { background: #d4edda; color: #155724; padding: 1px 6px; border-radius: 3px; font-size: 11px; }

  .delete {
    background: none;
    border: none;
    color: #bbb;
    cursor: pointer;
    font-size: 14px;
    padding: 2px 4px;
    flex-shrink: 0;
    margin-right: -8px;
  }
  .delete:hover { color: #cc3300; }

  .data-menu-wrap { position: relative; display: flex; }
  .data-menu-btn {
    background: none; border: 1px solid #ddd; border-radius: 8px;
    font-size: 18px; cursor: pointer; padding: 4px 10px;
    color: #999; line-height: 1; box-sizing: border-box; height: 100%;
  }
  .data-menu-btn:hover { color: #333; background: #f0f0f0; }
  .data-menu {
    position: absolute; top: calc(100% + 4px); right: 0; background: white;
    border: 1px solid #ddd; border-radius: 8px; padding: 4px 0; z-index: 50;
    min-width: 140px; box-shadow: 0 4px 12px rgba(0,0,0,0.12);
  }
  .data-menu button {
    display: block; width: 100%; text-align: left; padding: 8px 14px;
    border: none; background: none; cursor: pointer; font-size: 13px; color: #222;
  }
  .data-menu button:hover { background: #f5f5f5; }
</style>
