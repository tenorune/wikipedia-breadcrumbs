<script lang="ts">
  import { goto } from "$app/navigation";
  import { trailStore } from "@wikipedia-breadcrumbs/shared";
  import ConfirmDialog from "./ConfirmDialog.svelte";
  import { db } from "$lib/stores/db";
  import { exportTrailsJson, exportTrailsCsv, downloadFile, exportFilename, parseImportJson, detectConflicts, executeImport, pickFile } from "@wikipedia-breadcrumbs/shared";
  import type { ConflictItem, ImportPlan } from "@wikipedia-breadcrumbs/shared";
  import { getDeviceId } from "$lib/stores/device-id";
  import { useLiveQuery } from "$lib/live-query.svelte";
  import { queryTrailData, type TrailData, type TrailSummary } from "$lib/queries";

  const ts = trailStore(db);

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

  const data = useLiveQuery(() => queryTrailData(db), null as TrailData | null);
  const loaded = $derived(data.current !== null);
  const summaries = $derived(data.current?.summaries ?? []);

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

  async function toggleStar(summary: TrailSummary, e: Event) {
    e.stopPropagation();
    await ts.update(summary.trail.id, { isStarred: !summary.trail.isStarred });
  }

  let confirmState = $state<{ message: string; action: () => void } | null>(null);

  async function deleteTrail(summary: TrailSummary, e: Event) {
    e.stopPropagation();
    confirmState = {
      message: `Delete "${summary.displayName}"?`,
      action: async () => { await ts.softDelete(summary.trail.id); },
    };
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric", month: "long", day: "numeric",
    });
  }

  import { TrailStatus } from "@wikipedia-breadcrumbs/shared";

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

  let importConflicts = $state<ConflictItem[]>([]);
  let importClean = $state<any[]>([]);
  let importDecisions = $state<Record<string, "skip" | "overwrite" | "copy">>({});
  let importResult = $state<{ trailsImported: number; visitsImported: number; skipped: number; errors: string[] } | null>(null);
  let importError = $state("");
  let showConflictDialog = $state(false);

  async function handleExport(format: "json" | "csv") {
    dataMenuOpen = false;
    const content = format === "json"
      ? await exportTrailsJson(db)
      : await exportTrailsCsv(db);
    downloadFile(content, exportFilename(null, format), format === "json" ? "application/json" : "text/csv");
  }

  async function handleImport() {
    dataMenuOpen = false;
    importError = "";
    importResult = null;
    const content = await pickFile(".json");
    if (!content) return;

    const parsed = parseImportJson(content);
    if (parsed.errors.length > 0) {
      importError = parsed.errors.join("\n");
      return;
    }

    const detected = await detectConflicts(db, parsed.trails);
    importClean = detected.clean;

    if (detected.conflicts.length > 0) {
      importConflicts = detected.conflicts;
      importDecisions = {};
      for (const c of detected.conflicts) {
        importDecisions[c.imported.id] = "skip";
      }
      showConflictDialog = true;
    } else {
      await doImport(detected.clean, []);
    }
  }

  async function confirmImport() {
    showConflictDialog = false;
    const resolved = importConflicts.map((c) => ({
      trail: c.imported,
      action: importDecisions[c.imported.id],
    }));
    await doImport(importClean, resolved);
  }

  async function doImport(clean: any[], resolved: any[]) {
    const plan: ImportPlan = {
      items: [
        ...clean.map((t: any) => ({ trail: t, action: "overwrite" as const })),
        ...resolved,
      ],
    };
    const deviceId = getDeviceId();
    importResult = await executeImport(db, plan, { userId: null, deviceId });
  }
</script>

{#if loaded}
<div class="fade-in">
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

        <button class="info" onclick={() => goto("/trails/" + summary.trail.id)}>
          <span class="name">{summary.displayName}</span>
          <span class="meta">
            {summary.visitCount} pages &middot; {formatDate(summary.lastDiscovered)}
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
</div>
{/if}

<style>
  .fade-in { animation: fadeIn 0.1s ease-in; }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
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
  .meta { font-size: 11px; color: #888; display: flex; align-items: center; gap: 6px; }

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

  .import-error { color: #dc3545; font-size: 12px; margin-bottom: 10px; white-space: pre-wrap; }
  .import-result { font-size: 12px; color: #155724; background: #d4edda; padding: 6px 10px; border-radius: 6px; margin-bottom: 10px; }
  .import-errors { color: #dc3545; margin-top: 4px; }

  .conflict-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .conflict-dialog { background: white; border-radius: 12px; padding: 20px; max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto; }
  .conflict-dialog h3 { margin: 0 0 8px; }
  .conflict-dialog p { font-size: 13px; color: #666; margin: 0 0 12px; }
  .conflict-item { margin: 12px 0; padding: 10px; border: 1px solid #e8e8e8; border-radius: 8px; }
  .conflict-actions { display: flex; gap: 12px; margin-top: 6px; font-size: 13px; }
  .conflict-actions label { display: flex; align-items: center; gap: 4px; cursor: pointer; }
  .dialog-actions { display: flex; gap: 8px; margin-top: 16px; }
  .dialog-actions button { padding: 6px 16px; border: 1px solid #ddd; border-radius: 6px; cursor: pointer; background: white; }
  .dialog-actions .confirm { background: #0066cc; color: white; border: none; }
</style>
