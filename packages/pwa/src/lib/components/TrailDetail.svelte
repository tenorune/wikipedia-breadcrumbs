<script lang="ts">
  import { onMount } from "svelte";
  import { trailStore, visitStore, splitTrail, mergeTrails, TrailStatus, exportTrailsJson, exportTrailsCsv, downloadFile, exportFilename } from "@wikipedia-breadcrumbs/shared";
  import type { Trail, Visit } from "@wikipedia-breadcrumbs/shared";
  import { db } from "$lib/stores/db";
  import VisitCard from "./VisitCard.svelte";
  import ConfirmDialog from "./ConfirmDialog.svelte";

  interface Props {
    trailId: string;
    onBack: () => void;
  }

  let { trailId, onBack }: Props = $props();

  const ts = trailStore(db);
  const vs = visitStore(db);

  let trail = $state<Trail | null>(null);
  let visits = $state<Visit[]>([]);
  let allTrails = $state<Trail[]>([]);
  let trailDisplayNames = $state<Record<string, string>>({});

  // Editable fields
  let editingName = $state(false);
  let nameValue = $state("");
  let editingNote = $state(false);
  let noteValue = $state("");

  // Stamp dismiss on mousedown while editing, so focus toggle is suppressed
  $effect(() => {
    if (!editingName && !editingNote) return;
    const stamp = () => { (window as any).__dismissTime = Date.now(); };
    document.addEventListener("mousedown", stamp, true);
    return () => document.removeEventListener("mousedown", stamp, true);
  });

  // Sort state (persisted to localStorage)
  type SortField = "discovery" | "visited";
  type SortDir = "asc" | "desc";

  const SORT_KEY = $derived(`trailDetail_sort_${trailId}`);

  function loadSortPrefs(): { field: SortField; dir: SortDir } {
    try {
      const stored = localStorage.getItem(SORT_KEY);
      if (stored) return JSON.parse(stored);
    } catch {}
    return { field: "discovery", dir: "asc" };
  }

  let sortField = $state<SortField>("discovery");
  let sortDir = $state<SortDir>("asc");

  // Focused view
  let focusedVisitId: string | null = $state(null);

  // Merge UI
  let showMerge = $state(false);
  let mergeTargetId = $state("");
  let mergeTargetLabel = $state("Select a trail…");
  let mergeDropdownOpen = $state(false);

  $effect(() => {
    if (!mergeDropdownOpen) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".merge-dropdown-wrap")) mergeDropdownOpen = false;
    };
    setTimeout(() => document.addEventListener("click", close));
    return () => document.removeEventListener("click", close);
  });

  // Detail menu (merge/export)
  let detailMenuOpen = $state(false);

  $effect(() => {
    if (!detailMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".detail-menu-wrap")) detailMenuOpen = false;
    };
    setTimeout(() => document.addEventListener("click", close));
    return () => document.removeEventListener("click", close);
  });

  async function loadData() {
    const [t, v, all] = await Promise.all([
      ts.getById(trailId),
      vs.getByTrailId(trailId),
      ts.getAll(),
    ]);
    trail = t ?? null;
    visits = v;
    allTrails = all.filter((x) => x.id !== trailId);

    // Build display names for merge candidates
    const names: Record<string, string> = {};
    await Promise.all(
      allTrails.map(async (t) => {
        if (t.name) {
          names[t.id] = t.name;
        } else {
          const tv = await vs.getByTrailId(t.id);
          names[t.id] = tv.length === 0 ? "Empty trail"
            : tv.length === 1 ? tv[0].title
            : `${tv[0].title} → ${tv[tv.length - 1].title}`;
        }
      })
    );
    trailDisplayNames = names;
  }

  onMount(() => {
    const prefs = loadSortPrefs();
    sortField = prefs.field;
    sortDir = prefs.dir;
    loadData();
    const onVisible = () => { if (document.visibilityState === "visible") loadData(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  });

  function saveSortPrefs() {
    localStorage.setItem(SORT_KEY, JSON.stringify({ field: sortField, dir: sortDir }));
  }

  function setSortField(f: SortField) {
    if (sortField === f) {
      sortDir = sortDir === "asc" ? "desc" : "asc";
    } else {
      sortField = f;
      sortDir = "asc";
    }
    saveSortPrefs();
  }

  const sortedVisits = $derived.by(() => {
    const list = [...visits];
    list.sort((a, b) => {
      const aVal = sortField === "discovery" ? a.timestamp : a.lastVisitedAt;
      const bVal = sortField === "discovery" ? b.timestamp : b.lastVisitedAt;
      return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
    return list;
  });

  const focusedView = $derived.by(() => {
    if (!focusedVisitId || sortField !== "discovery") return null;
    const focused = visits.find((v) => v.id === focusedVisitId);
    if (!focused) return null;
    const parent = focused.parentVisitId
      ? visits.find((v) => v.id === focused.parentVisitId) ?? null
      : null;
    const children = visits.filter((v) => v.parentVisitId === focused.id);
    return { focused, parent, children };
  });

  function toggleFocus(visitId: string) {
    if ((window as any).__dismissTime && Date.now() - (window as any).__dismissTime < 300) return;
    focusedVisitId = focusedVisitId === visitId ? null : visitId;
  }

  const sortHint = $derived(
    focusedView ? "focused view" : sortDir === "asc" ? "oldest to newest" : "newest to oldest"
  );

  const trailDisplayName = $derived.by(() => {
    if (!trail) return "";
    if (trail.name) return trail.name;
    if (visits.length === 0) return "Empty trail";
    if (visits.length === 1) return visits[0].title;
    return `${visits[0].title} → ${visits[visits.length - 1].title}`;
  });

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric",
    });
  }

  async function saveName() {
    if (!trail) return;
    const v = nameValue.trim() || null;
    await ts.update(trail.id, { name: v });
    editingName = false;
    (window as any).__dismissTime = Date.now();
    await loadData();
  }

  async function autoSaveName() {
    if (!trail) return;
    await ts.update(trail.id, { name: nameValue.trim() || null });
  }

  async function saveNote() {
    if (!trail) return;
    const v = noteValue.trim() || null;
    await ts.update(trail.id, { note: v });
    editingNote = false;
    (window as any).__dismissTime = Date.now();
    await loadData();
  }

  async function autoSaveNote() {
    if (!trail) return;
    await ts.update(trail.id, { note: noteValue.trim() || null });
  }

  async function toggleStar() {
    if (!trail) return;
    await ts.update(trail.id, { isStarred: !trail.isStarred });
    await loadData();
  }

  async function handleUpdateNote(visitId: string, note: string | null) {
    await vs.update(visitId, { note });
    await loadData();
  }

  let confirmState = $state<{ message: string; confirmLabel: string; action: () => void } | null>(null);

  async function handleDeleteVisit(visitId: string) {
    confirmState = {
      message: "Delete this visit?",
      confirmLabel: "Delete",
      action: async () => { await vs.softDelete(visitId); await loadData(); },
    };
  }

  async function handleSplit(position: number) {
    if (!trail) return;
    confirmState = {
      message: "Split trail here? Visits after this point will become a new trail.",
      confirmLabel: "Split",
      action: async () => { await splitTrail(db, trail!.id, position); await loadData(); },
    };
  }

  async function handleMerge() {
    if (!mergeTargetId) return;
    const label = trailDisplayNames[mergeTargetId] ?? "this trail";
    confirmState = {
      message: `Merge "${label}" into this trail? The other trail will be deleted.`,
      confirmLabel: "Merge",
      action: async () => { await mergeTrails(db, trailId, mergeTargetId); showMerge = false; mergeTargetId = ""; await loadData(); },
    };
  }

  async function handleDetailExport(format: "json" | "csv") {
    detailMenuOpen = false;
    const content = format === "json"
      ? await exportTrailsJson(db, [trailId])
      : await exportTrailsCsv(db, [trailId]);
    downloadFile(content, exportFilename(trail?.name ?? null, format), format === "json" ? "application/json" : "text/csv");
  }

  // Only show split button in discovery-asc view (positional order)
  const showSplit = $derived(sortField === "discovery" && sortDir === "asc");
</script>

{#if !trail}
  <div class="loading">Loading…</div>
{:else}
  <div class="header-box">
    <button class="star" class:starred={trail.isStarred} onclick={toggleStar}
      title={trail.isStarred ? "Unstar" : "Star"}
    >
      {trail.isStarred ? "★" : "☆"}
    </button>
    <div class="header-content">
      <div class="title-row">
        {#if editingName}
          <!-- svelte-ignore a11y_autofocus -->
          <input
            class="name-input"
            type="text"
            bind:value={nameValue}
            placeholder="Trail name"
            onkeydown={(e) => { if (e.key === "Enter") saveName(); }}
            onblur={saveName}
            oninput={autoSaveName}
            autofocus
          />
        {:else}
          <h1 class="trail-name">
            <button class="name-edit-trigger"
              onclick={() => { editingName = true; nameValue = trail?.name ?? ""; }}
              title="Click to edit name"
            >
              {trailDisplayName}
            </button>
          </h1>
          <div class="detail-menu-wrap">
            <button class="detail-menu-btn" onclick={() => { detailMenuOpen = !detailMenuOpen; }} title="Actions">⋮</button>
            {#if detailMenuOpen}
              <div class="detail-menu">
                <button onclick={() => { detailMenuOpen = false; showMerge = !showMerge; }}>Merge</button>
                <button onclick={() => handleDetailExport("json")}>Export JSON</button>
                <button onclick={() => handleDetailExport("csv")}>Export CSV</button>
              </div>
            {/if}
          </div>
        {/if}
      </div>
      <div class="meta">
        <span>{visits.length} page{visits.length === 1 ? "" : "s"}</span>
        <span>·</span>
        <span>Started {formatDate(trail.startedAt)}</span>
      </div>
      <div class="trail-note-section">
        {#if trail.note && !editingNote}
          <div class="trail-note" role="button" tabindex="0"
            onclick={() => { editingNote = true; noteValue = trail?.note ?? ""; }}
            onkeydown={(e) => e.key === "Enter" && (editingNote = true)}
            title="Click to edit"
          >
            {trail.note}
          </div>
        {:else if editingNote}
          <!-- svelte-ignore a11y_autofocus -->
          <textarea
            class="trail-note-input"
            rows="3"
            bind:value={noteValue}
            placeholder="Add a note about this trail…"
            onblur={saveNote}
            oninput={autoSaveNote}
            autofocus
          ></textarea>
        {:else}
          <button class="add-note" onclick={() => { editingNote = true; noteValue = ""; }}>+ Add trail note</button>
        {/if}
      </div>
    </div>
  </div>

  {#if showMerge}
    <div class="merge-picker">
      <div class="merge-dropdown-wrap">
        <button class="merge-dropdown-btn" onclick={() => { mergeDropdownOpen = !mergeDropdownOpen; }}>
          <span class="merge-dropdown-label">{mergeTargetLabel}</span>
          <span class="merge-dropdown-arrow">▾</span>
        </button>
        {#if mergeDropdownOpen}
          <div class="merge-dropdown">
            {#each allTrails as t}
              <button class:selected={mergeTargetId === t.id} onclick={() => {
                mergeTargetId = t.id;
                mergeTargetLabel = trailDisplayNames[t.id] ?? "…";
                mergeDropdownOpen = false;
              }}>{trailDisplayNames[t.id] ?? "…"}</button>
            {/each}
          </div>
        {/if}
      </div>
      <button class="btn-save" onclick={handleMerge} disabled={!mergeTargetId}>Merge</button>
      <button class="btn-cancel" onclick={() => { showMerge = false; mergeTargetId = ""; mergeTargetLabel = "Select a trail…"; }}>Cancel</button>
    </div>
  {/if}

  <!-- Sort bar -->
  <div class="sort-bar">
    <div class="sort-buttons">
      <button
        class="sort-btn"
        class:active={sortField === "discovery"}
        onclick={() => {
          if (focusedView) { focusedVisitId = null; }
          else { setSortField("discovery"); }
        }}
      >
        Discovery {focusedView ? "◎" : sortField === "discovery" ? (sortDir === "asc" ? "↑" : "↓") : ""}
      </button>
      <button
        class="sort-btn"
        class:active={sortField === "visited"}
        onclick={() => setSortField("visited")}
      >
        Visited {sortField === "visited" ? (sortDir === "asc" ? "↑" : "↓") : ""}
      </button>
      <span class="sort-hint">{sortHint}</span>
    </div>
  </div>

  <!-- Visit list -->
  <div class="visits">
    {#if sortedVisits.length === 0}
      <p class="empty">No visits in this trail.</p>
    {:else if focusedView}
      {#if focusedView.parent}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="focused-grandparent" onclick={(e) => {
          if ((e.target as HTMLElement).closest("a, button, input, textarea, .note, .card-menu-wrap, .cite-wrap, .note-edit")) return;
          toggleFocus(focusedView.parent!.id);
        }}>
          <VisitCard
            visit={focusedView.parent}
            onUpdateNote={handleUpdateNote}
            onDelete={handleDeleteVisit}
          />
        </div>
      {/if}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="focused-current" onclick={(e) => {
        if ((e.target as HTMLElement).closest("a, button, input, textarea, .note, .card-menu-wrap, .cite-wrap, .note-edit")) return;
        toggleFocus(focusedView.focused.id);
      }}>
        <VisitCard
          visit={focusedView.focused}
          onUpdateNote={handleUpdateNote}
          onDelete={handleDeleteVisit}
        />
      </div>
      {#if focusedView.children.length > 0}
        {#each focusedView.children as child}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="focused-child" onclick={(e) => {
            if ((e.target as HTMLElement).closest("a, button, input, textarea, .note, .card-menu-wrap, .cite-wrap, .note-edit")) return;
            toggleFocus(child.id);
          }}>
            <VisitCard
              visit={child}
              onUpdateNote={handleUpdateNote}
              onDelete={handleDeleteVisit}
            />
          </div>
        {/each}
      {:else}
        <p class="no-children">No pages were discovered from this page.</p>
      {/if}
    {:else}
      {#each sortedVisits as visit, i (visit.id)}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="visit-wrapper" class:focusable={sortField === "discovery"} onclick={(e) => {
          if ((e.target as HTMLElement).closest("a, button, input, textarea, .note, .card-menu-wrap, .cite-wrap, .note-edit")) return;
          if (sortField === "discovery") toggleFocus(visit.id);
        }}>
          <VisitCard
            {visit}
            onUpdateNote={handleUpdateNote}
            onDelete={handleDeleteVisit}
            onSplit={showSplit && i < sortedVisits.length - 1 ? handleSplit : undefined}
          />
        </div>
      {/each}
    {/if}
  </div>
{/if}

{#if confirmState}
  <ConfirmDialog
    message={confirmState.message}
    confirmLabel={confirmState.confirmLabel}
    onConfirm={() => { confirmState!.action(); confirmState = null; }}
    onCancel={() => { confirmState = null; }}
  />
{/if}

<style>
  .loading { color: #888; padding: 20px 0; }

  .back {
    background: none;
    border: none;
    color: #0066cc;
    cursor: pointer;
    font-size: 14px;
    padding: 0;
    margin-bottom: 10px;
    display: inline-block;
  }
  .back:hover { text-decoration: underline; }

  .header-box {
    display: flex; gap: 10px; padding: 12px; border: 1px solid #e8e8e8;
    border-radius: 10px; margin-bottom: 14px; align-items: start; position: relative;
  }
  .header-content { flex: 1; min-width: 0; }
  .title-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .trail-name {
    font-size: 20px;
    font-weight: 700;
    margin: 0;
    flex: 1;
    word-break: break-word;
    line-height: 1.3;
  }
  .name-edit-trigger {
    background: none;
    border: none;
    font: inherit;
    color: inherit;
    cursor: pointer;
    padding: 0;
    text-align: left;
  }
  .name-edit-trigger:hover { text-decoration: underline; }

  .name-input {
    flex: 1;
    font-size: 20px;
    font-weight: 700;
    padding: 0;
    border: none;
    box-shadow: 0 2px 0 #0066cc;
    border-radius: 0;
    outline: none;
    line-height: 1.3;
  }

  .star {
    background: none;
    border: none;
    font-size: 20px;
    cursor: pointer;
    color: #ccc;
    padding: 0;
    flex-shrink: 0;
  }
  .star.starred { color: #f5a623; }

  .detail-menu-wrap { position: absolute; top: 8px; right: 8px; }
  .detail-menu-btn {
    background: none; border: none;
    font-size: 16px; cursor: pointer; padding: 0 4px; color: #999; line-height: 1;
  }
  .detail-menu-btn:hover { color: #333; }
  .detail-menu {
    position: absolute; top: calc(100% + 4px); right: 0; background: white;
    border: 1px solid #ddd; border-radius: 8px; padding: 4px 0; z-index: 50;
    min-width: 140px; box-shadow: 0 4px 12px rgba(0,0,0,0.12);
  }
  .detail-menu button {
    display: block; width: 100%; text-align: left; padding: 8px 14px;
    border: none; background: none; cursor: pointer; font-size: 13px; color: #222;
  }
  .detail-menu button:hover { background: #f5f5f5; }

  .merge-picker {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 10px;
    padding: 10px;
    background: #f8f8f8;
    border-radius: 8px;
    border: 1px solid #e0e0e0;
  }
  .merge-dropdown-wrap { position: relative; flex: 1; min-width: 0; }
  .merge-dropdown-btn {
    width: 100%; padding: 6px 8px; border: 1px solid #ddd; border-radius: 6px;
    background: white; cursor: pointer; font-size: 13px; text-align: left;
    display: flex; justify-content: space-between; align-items: center;
  }
  .merge-dropdown-btn:hover { border-color: #bbb; }
  .merge-dropdown-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .merge-dropdown-arrow { color: #555; flex-shrink: 0; margin-left: 8px; }
  .merge-dropdown {
    position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: white;
    border: 1px solid #ddd; border-radius: 8px; padding: 4px 0; z-index: 50;
    max-height: 200px; overflow-y: auto; box-shadow: 0 4px 12px rgba(0,0,0,0.12);
  }
  .merge-dropdown button {
    display: block; width: 100%; text-align: left; padding: 8px 12px;
    border: none; background: none; cursor: pointer; font-size: 13px; color: #222;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .merge-dropdown button:hover { background: #f5f5f5; }
  .merge-dropdown button.selected { background: #e8f0fe; color: #0066cc; }

  .btn-save {
    font-size: 12px; padding: 4px 10px; background: #0066cc; color: white;
    border: none; border-radius: 6px; cursor: pointer;
  }
  .btn-save:disabled { opacity: 0.5; cursor: default; }
  .btn-cancel {
    font-size: 12px; padding: 4px 10px; background: #eee; color: #333;
    border: none; border-radius: 6px; cursor: pointer;
  }

  .meta {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: #666;
    flex-wrap: wrap;
    margin-top: 4px;
  }

  .badge {
    font-size: 10px; padding: 1px 6px; border-radius: 10px; font-weight: 600;
  }
  .badge.active { background: #d4f0d4; color: #2a7a2a; }

  .trail-note-section { margin-top: 8px; }
  .trail-note {
    font-size: 13px; color: #333; background: #f8f8f8;
    border-radius: 6px; padding: 8px 10px; cursor: pointer;
    white-space: pre-wrap; word-break: break-word;
  }
  .trail-note:hover { background: #f0f0f0; }
  .trail-note-input {
    width: 100%; box-sizing: border-box; padding: 8px 10px;
    border: 1px solid #ddd; border-radius: 6px;
    font-size: 16px; font-family: inherit; resize: vertical;
  }
  .add-note {
    background: none; border: none; color: #0066cc;
    cursor: pointer; font-size: 13px; padding: 0;
  }
  .add-note:hover { text-decoration: underline; }

  .sort-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
    gap: 8px;
  }
  .sort-buttons { display: flex; gap: 4px; align-items: center; }
  .sort-btn {
    font-size: 12px; padding: 5px 12px;
    border: 1px solid #ddd; border-radius: 6px;
    background: #f8f8f8; cursor: pointer; color: #555;
    min-width: 90px; height: 28px;
  }
  .sort-btn.active { background: #e8f0fe; color: #0066cc; border-color: #aac4f5; }
  .sort-hint { font-size: 11px; color: #aaa; }

  .visits { display: flex; flex-direction: column; gap: 8px; }
  .empty { color: #888; font-size: 13px; }

  .visit-wrapper.focusable { cursor: pointer; border-radius: 10px; }
  .visit-wrapper.focusable:hover { background: #fafafa; }
  .focused-grandparent { opacity: 0.6; cursor: pointer; }
  .focused-grandparent:hover { opacity: 0.8; }
  .focused-current { cursor: pointer; }
  .focused-current > :global(.card) { background: #f0f7ff; }
  .focused-current:hover > :global(.card) { background: #e4effa; }
  .focused-child { margin-left: 16px; border-left: 2px solid #0066cc; padding-left: 12px; cursor: pointer; }
  .focused-child:hover { background: #fafafa; border-radius: 0 10px 10px 0; }
  .no-children { color: #999; font-size: 13px; margin: 4px 0 0 16px; }
</style>
