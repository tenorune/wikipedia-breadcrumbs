<script lang="ts">
  import type { Trail } from "@wikipedia-breadcrumbs/shared";
  import { BreadcrumbsDB, trailStore, visitStore } from "@wikipedia-breadcrumbs/shared";
  import { exportTrailsJson, exportTrailsCsv, downloadFile, exportFilename, parseImportJson, detectConflicts, executeImport, pickFile } from "@wikipedia-breadcrumbs/shared";
  import type { ConflictItem, ImportPlan } from "@wikipedia-breadcrumbs/shared";
  import { getDeviceId } from "../shared/device-id.js";
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

  let importConflicts = $state<ConflictItem[]>([]);
  let importClean = $state<any[]>([]);
  let importDecisions = $state<Record<string, "skip" | "overwrite" | "copy">>({});
  let importResult = $state<{ trailsImported: number; visitsImported: number; skipped: number; errors: string[] } | null>(null);
  let importError = $state("");
  let showConflictDialog = $state(false);

  async function handleExport(format: "json" | "csv") {
    dataMenuOpen = false;
    const content = format === "json"
      ? await exportTrailsJson(db, undefined)
      : await exportTrailsCsv(db, undefined);
    downloadFile(content, exportFilename(null, format), format === "json" ? "application/json" : "text/csv");
  }

  async function handleImport() {
    dataMenuOpen = false;
    importError = "";
    importResult = null;
    const content = await pickFile(".json");
    if (!content) return;
    const parsed = parseImportJson(content);
    if (parsed.errors.length > 0) { importError = parsed.errors.join("\n"); return; }
    const detected = await detectConflicts(db, parsed.trails);
    importClean = detected.clean;
    if (detected.conflicts.length > 0) {
      importConflicts = detected.conflicts;
      importDecisions = {};
      for (const c of detected.conflicts) importDecisions[c.imported.id] = "skip";
      showConflictDialog = true;
    } else {
      await doImport(detected.clean, []);
    }
  }

  async function confirmImport() {
    showConflictDialog = false;
    const resolved = importConflicts.map((c) => ({ trail: c.imported, action: importDecisions[c.imported.id] }));
    await doImport(importClean, resolved);
  }

  async function doImport(clean: any[], resolved: any[]) {
    const plan: ImportPlan = {
      items: [
        ...clean.map((t: any) => ({ trail: t, action: "overwrite" as const })),
        ...resolved,
      ],
    };
    const deviceId = await getDeviceId();
    importResult = await executeImport(db, plan, { userId: null, deviceId });
    await refresh();
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
    <input type="text" placeholder="Search trails..." bind:value={searchQuery} />
    <div class="sort-dropdown-wrap">
      <button class="sort-dropdown-btn" onclick={() => { sortDropdownOpen = !sortDropdownOpen; }}>
        <span>{sortLabels[sortBy]}</span>
        <span class="sort-dropdown-arrow">▾</span>
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
      <button class="data-menu-btn" onclick={() => { dataMenuOpen = !dataMenuOpen; }} title="Import / Export">⋮</button>
      {#if dataMenuOpen}
        <div class="data-menu">
          <button onclick={handleImport}>Import</button>
          <button onclick={() => handleExport("json")}>Export JSON</button>
          <button onclick={() => handleExport("csv")}>Export CSV</button>
        </div>
      {/if}
    </div>
  </div>

  {#if importError}
    <div class="import-error">{importError}</div>
  {/if}
  {#if importResult}
    <div class="import-result">
      Imported {importResult.trailsImported} trail{importResult.trailsImported === 1 ? "" : "s"}
      ({importResult.visitsImported} visit{importResult.visitsImported === 1 ? "" : "s"}).
      {#if importResult.skipped > 0}Skipped {importResult.skipped}.{/if}
      {#if importResult.errors.length > 0}
        <div class="import-errors">{importResult.errors.join("; ")}</div>
      {/if}
    </div>
  {/if}

  {#if showConflictDialog}
    <div class="conflict-overlay">
      <div class="conflict-dialog">
        <h3>Import Conflicts</h3>
        <p>{importConflicts.length} trail{importConflicts.length === 1 ? "" : "s"} already exist{importConflicts.length === 1 ? "s" : ""} locally.</p>
        {#each importConflicts as conflict}
          <div class="conflict-item">
            <strong>{conflict.imported.name ?? (conflict.imported.visits.length > 0 ? `${conflict.imported.visits[0].title} → ${conflict.imported.visits[conflict.imported.visits.length - 1].title}` : "Empty trail")}</strong>
            <span>({conflict.imported.visits.length} visits)</span>
            <div class="conflict-actions">
              <label><input type="radio" bind:group={importDecisions[conflict.imported.id]} value="skip" /> Skip</label>
              <label><input type="radio" bind:group={importDecisions[conflict.imported.id]} value="overwrite" /> Overwrite</label>
              <label><input type="radio" bind:group={importDecisions[conflict.imported.id]} value="copy" /> Import as copy</label>
            </div>
          </div>
        {/each}
        <div class="dialog-actions">
          <button class="confirm" onclick={confirmImport}>Import</button>
          <button onclick={() => { showConflictDialog = false; }}>Cancel</button>
        </div>
      </div>
    </div>
  {/if}

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
          <button class="star" class:starred={summary.trail.isStarred} onclick={() => toggleStar(summary.trail.id)}>
            {summary.trail.isStarred ? "★" : "☆"}
          </button>
          <div class="trail-info" onclick={() => onSelectTrail(summary.trail)}>
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
  .import-error { color: #dc3545; font-size: 12px; margin-bottom: 10px; white-space: pre-wrap; }
  .import-result { font-size: 12px; color: #155724; background: #d4edda; padding: 6px 10px; border-radius: 4px; margin-bottom: 10px; }
  .import-errors { color: #dc3545; margin-top: 4px; }
  .conflict-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .conflict-dialog { background: white; border-radius: 8px; padding: 20px; max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto; }
  .conflict-dialog h3 { margin: 0 0 8px; }
  .conflict-dialog p { font-size: 13px; color: #666; margin: 0 0 12px; }
  .conflict-item { margin: 12px 0; padding: 8px; border: 1px solid #eee; border-radius: 4px; }
  .conflict-actions { display: flex; gap: 12px; margin-top: 6px; font-size: 13px; }
  .conflict-actions label { display: flex; align-items: center; gap: 4px; cursor: pointer; }
  .dialog-actions { display: flex; gap: 8px; margin-top: 16px; }
  .dialog-actions button { padding: 6px 16px; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; background: white; }
  .dialog-actions .confirm { background: #0066cc; color: white; border: none; }
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
