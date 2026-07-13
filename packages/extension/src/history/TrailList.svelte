<script lang="ts">
  import type { Trail } from "@wikipedia-breadcrumbs/shared";
  import { BreadcrumbsDB, trailStore, visitStore } from "@wikipedia-breadcrumbs/shared";
  import { exportTrailsJson, exportTrailsCsv, downloadFile, exportFilename } from "@wikipedia-breadcrumbs/shared";
  import { getDeviceId } from "../shared/device-id.js";
  import { ImportDialog } from "@wikipedia-breadcrumbs/ui";
  import ConfirmDialog from "./ConfirmDialog.svelte";

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
      ? await exportTrailsJson(db, undefined)
      : await exportTrailsCsv(db, undefined);
    downloadFile(content, exportFilename(null, format), format === "json" ? "application/json" : "text/csv");
  }

  interface TrailSummary {
    trail: Trail;
    visitCount: number;
    firstTitle: string;
    lastTitle: string;
    lastDiscoveredAt: string;
    searchText: string;
  }

  interface Props {
    onSelectTrail: (trail: Trail) => void;
  }

  let { onSelectTrail }: Props = $props();

  let trails: TrailSummary[] = $state([]);
  let searchQuery = $state("");
  let sortBy: "recent" | "oldest" | "starred" = $state("recent");
  let sortDropdownOpen = $state(false);
  let loading = $state(true);

  const sortLabels: Record<string, string> = { recent: "Most Recent", oldest: "Oldest First", starred: "Starred First" };

  $effect(() => {
    if (!sortDropdownOpen) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".sort-dropdown-wrap")) sortDropdownOpen = false;
    };
    setTimeout(() => document.addEventListener("click", close));
    return () => document.removeEventListener("click", close);
  });

  const db = new BreadcrumbsDB();
  const trailOps = trailStore(db);
  const visitOps = visitStore(db);

  export async function refresh() {
    loading = true;
    const allTrails = await trailOps.getAll();
    const summaries: TrailSummary[] = [];
    for (const trail of allTrails) {
      const visits = await visitOps.getByTrailId(trail.id);
      const searchParts = [trail.name ?? "", trail.note ?? ""];
      for (const v of visits) {
        searchParts.push(v.title, v.note ?? "");
      }
      summaries.push({
        trail, visitCount: visits.length,
        firstTitle: visits[0]?.title ?? "",
        lastTitle: visits[visits.length - 1]?.title ?? "",
        lastDiscoveredAt: visits[visits.length - 1]?.timestamp ?? trail.startedAt,
        searchText: searchParts.join(" ").toLowerCase(),
      });
    }
    trails = summaries;
    loading = false;
  }

  const filteredTrails = $derived.by(() => {
    let result = trails;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((s) => s.searchText.includes(q));
    }
    if (sortBy === "recent") {
      result = [...result].sort((a, b) => b.trail.updatedAt.localeCompare(a.trail.updatedAt));
    } else if (sortBy === "oldest") {
      result = [...result].sort((a, b) => a.trail.startedAt.localeCompare(b.trail.startedAt));
    } else if (sortBy === "starred") {
      result = [...result].sort((a, b) => (b.trail.isStarred ? 1 : 0) - (a.trail.isStarred ? 1 : 0));
    }
    return result;
  });

  async function toggleStar(trailId: string) {
    const summary = trails.find((s) => s.trail.id === trailId);
    if (!summary) return;
    summary.trail.isStarred = !summary.trail.isStarred;
    await trailOps.update(trailId, { isStarred: summary.trail.isStarred });
    trails = [...trails];
  }

  let confirmState = $state<{ message: string; confirmLabel: string; action: () => void } | null>(null);

  async function deleteTrail(trailId: string, name: string) {
    confirmState = {
      message: `Delete "${name}"?`,
      confirmLabel: "Delete",
      action: async () => { await trailOps.softDelete(trailId); chrome.runtime.sendMessage({ type: "trailDeleted", trailId }); await refresh(); },
    };
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  }

  refresh();
</script>

<div class="trail-list">
  <div class="toolbar">
    <input type="text" placeholder="Search trails..." bind:value={searchQuery} aria-label="Search trails" />
    <div class="sort-dropdown-wrap">
      <button class="sort-dropdown-btn" onclick={() => { sortDropdownOpen = !sortDropdownOpen; }}>
        <span>{sortLabels[sortBy]}</span>
        <span class="sort-dropdown-arrow" aria-hidden="true">▾</span>
      </button>
      {#if sortDropdownOpen}
        <div class="sort-dropdown">
          {#each ["recent", "oldest", "starred"] as mode}
            <button class:selected={sortBy === mode} onclick={() => { sortBy = mode as any; sortDropdownOpen = false; }}>{sortLabels[mode]}</button>
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

  <ImportDialog bind:this={importer} {db} {getDeviceId} onComplete={() => refresh()} />

  {#if loading}
    <div class="delayed-spinner"></div>
  {:else if filteredTrails.length === 0}
    <p class="empty">
      {searchQuery ? "No trails match your search." : "No trails yet. Browse Wikipedia to start!"}
    </p>
  {:else}
    <ul class="trails">
      {#each filteredTrails as summary}
        <li>
          <button class="star" class:starred={summary.trail.isStarred} onclick={() => toggleStar(summary.trail.id)} aria-label={summary.trail.isStarred ? "Unstar" : "Star"}>
            {summary.trail.isStarred ? "★" : "☆"}
          </button>
          <div class="trail-info" role="button" tabindex="0" onclick={() => onSelectTrail(summary.trail)} onkeydown={(e) => e.key === "Enter" && onSelectTrail(summary.trail)}>
            <span class="name">{summary.trail.name ?? `${summary.firstTitle} → ${summary.lastTitle}`}</span>
            <span class="meta">
              {summary.visitCount} pages &middot; {formatDate(summary.trail.startedAt)}{#if formatDate(summary.trail.startedAt) !== formatDate(summary.lastDiscoveredAt)}{" "}&mdash; {formatDate(summary.lastDiscoveredAt)}{/if}
              {#if summary.trail.status === "active"}
                <span class="active-badge">Active</span>
              {/if}
            </span>
          </div>
          <button class="delete" onclick={() => deleteTrail(summary.trail.id, summary.trail.name ?? (summary.firstTitle ? `${summary.firstTitle} → ${summary.lastTitle}` : "this trail"))} title="Delete trail" aria-label="Delete trail">✕</button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

{#if confirmState}
  <ConfirmDialog
    message={confirmState.message}
    confirmLabel={confirmState.confirmLabel}
    onConfirm={() => { confirmState!.action(); confirmState = null; }}
    onCancel={() => { confirmState = null; }}
  />
{/if}

<style>
  .trail-list { width: 100%; }
  .toolbar { display: flex; gap: 8px; margin-bottom: 16px; align-items: stretch; }
  .toolbar input { flex: 1; padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; box-sizing: border-box; }
  .sort-dropdown-wrap { position: relative; display: flex; }
  .sort-dropdown-btn {
    padding: 8px 10px; border: 1px solid #ccc; border-radius: 4px;
    background: white; cursor: pointer; font-size: 13px; box-sizing: border-box;
    display: flex; align-items: center; gap: 6px; white-space: nowrap; height: 100%;
  }
  .sort-dropdown-btn:hover { border-color: #999; }
  .sort-dropdown-arrow { color: #555; }
  .sort-dropdown {
    position: absolute; top: calc(100% + 4px); left: 0; background: white;
    border: 1px solid #ddd; border-radius: 6px; padding: 4px 0; z-index: 50;
    min-width: 140px; box-shadow: 0 4px 12px rgba(0,0,0,0.12);
  }
  .sort-dropdown button {
    display: block; width: 100%; text-align: left; padding: 6px 12px;
    border: none; background: none; cursor: pointer; font-size: 12px; color: #222;
  }
  .sort-dropdown button:hover { background: #f5f5f5; }
  .sort-dropdown button.selected { background: #e8f0fe; color: #0066cc; }
  .data-menu-wrap { position: relative; display: flex; }
  .data-menu-btn { background: none; border: 1px solid #ccc; border-radius: 4px; font-size: 18px; cursor: pointer; padding: 4px 10px; color: #999; line-height: 1; box-sizing: border-box; height: 100%; }
  .data-menu-btn:hover { color: #333; background: #f0f0f0; }
  .data-menu {
    position: absolute; top: calc(100% + 4px); right: 0; background: white;
    border: 1px solid #ddd; border-radius: 6px; padding: 4px 0; z-index: 50;
    min-width: 140px; box-shadow: 0 4px 12px rgba(0,0,0,0.12);
  }
  .data-menu button { display: block; width: 100%; text-align: left; padding: 6px 12px; border: none; background: none; cursor: pointer; font-size: 12px; color: #222; }
  .data-menu button:hover { background: #f5f5f5; }
  .trails { list-style: none; padding: 0; }
  .trails li { display: flex; align-items: center; gap: 8px; padding: 10px 0; border-bottom: 1px solid #eee; }
  .star { background: none; border: none; font-size: 18px; cursor: pointer; padding: 0 4px; color: #ccc; }
  .star.starred { color: #f5a623; }
  .trail-info { flex: 1; cursor: pointer; }
  .trail-info:hover .name { color: #0066cc; }
  .name { font-weight: 500; display: block; }
  .meta { font-size: 12px; color: #666; }
  .active-badge { background: #d4edda; color: #155724; padding: 1px 6px; border-radius: 3px; font-size: 11px; margin-left: 4px; }
  .delete { background: none; border: none; color: #bbb; cursor: pointer; font-size: 14px; padding: 2px 4px; flex-shrink: 0; margin-right: 2px; }
  .delete:hover { color: #cc3300; }
  .delete:hover { border-color: #dc3545; color: #dc3545; }
  .loading, .empty { text-align: center; color: #666; padding: 24px; }
</style>
