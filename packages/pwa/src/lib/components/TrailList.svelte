<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { trailStore, visitStore } from "@wikipedia-breadcrumbs/shared";
  import type { Trail } from "@wikipedia-breadcrumbs/shared";
  import { db } from "$lib/stores/db";
  import { exportTrailsJson, exportTrailsCsv, downloadFile, exportFilename, parseImportJson, detectConflicts, executeImport, pickFile } from "@wikipedia-breadcrumbs/shared";
  import type { ConflictItem, ImportPlan } from "@wikipedia-breadcrumbs/shared";
  import { getDeviceId } from "$lib/stores/device-id";

  const ts = trailStore(db);
  const vs = visitStore(db);

  type SortMode = "recent" | "oldest" | "starred";

  let trails = $state<Trail[]>([]);
  let displayNames = $state<Record<string, string>>({});
  let visitCounts = $state<Record<string, number>>({});
  let lastDiscovered = $state<Record<string, string>>({});
  let searchTexts = $state<Record<string, string>>({});
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

  async function loadTrails() {
    const all = await ts.getAll();
    trails = all;
    const names: Record<string, string> = {};
    const counts: Record<string, number> = {};
    const discovered: Record<string, string> = {};
    const texts: Record<string, string> = {};
    await Promise.all(
      all.map(async (t) => {
        const visits = await vs.getByTrailId(t.id);
        counts[t.id] = visits.length;
        discovered[t.id] = visits.length > 0 ? visits[visits.length - 1].timestamp : t.startedAt;
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
    visitCounts = counts;
    lastDiscovered = discovered;
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
    await loadTrails();
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
      <span class="sort-dropdown-arrow">▾</span>
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
            {visitCounts[trail.id] ?? 0} pages &middot; {formatDate(lastDiscovered[trail.id] ?? trail.startedAt)}
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
