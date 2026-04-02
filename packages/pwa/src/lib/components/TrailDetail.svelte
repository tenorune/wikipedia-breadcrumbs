<script lang="ts">
  import { onMount } from "svelte";
  import { trailStore, visitStore, splitTrail, mergeTrails, TrailStatus } from "@wikipedia-breadcrumbs/shared";
  import type { Trail, Visit } from "@wikipedia-breadcrumbs/shared";
  import { db } from "$lib/stores/db";
  import VisitCard from "./VisitCard.svelte";

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

  async function handleDeleteVisit(visitId: string) {
    if (!confirm("Delete this visit?")) return;
    await vs.softDelete(visitId);
    await loadData();
  }

  async function handleSplit(position: number) {
    if (!trail) return;
    if (!confirm("Split trail here? Visits after this point will become a new trail.")) return;
    await splitTrail(db, trail.id, position);
    await loadData();
  }

  async function handleMerge() {
    if (!mergeTargetId) return;
    if (!confirm(`Merge "${trailDisplayNames[mergeTargetId]}" into this trail? The other trail will be deleted.`)) return;
    await mergeTrails(db, trailId, mergeTargetId);
    showMerge = false;
    mergeTargetId = "";
    await loadData();
  }

  // Only show split button in discovery-asc view (positional order)
  const showSplit = $derived(sortField === "discovery" && sortDir === "asc");
</script>

{#if !trail}
  <div class="loading">Loading…</div>
{:else}
  <div class="header">
    <button class="back" onclick={onBack}>← Back</button>

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
        <button class="star" class:starred={trail.isStarred} onclick={toggleStar}
          title={trail.isStarred ? "Unstar" : "Star"}
        >
          {trail.isStarred ? "★" : "☆"}
        </button>
        <button class="btn-merge-toggle" onclick={() => { showMerge = !showMerge; }}>
          Merge
        </button>
      {/if}
    </div>

    {#if showMerge}
      <div class="merge-picker">
        <select bind:value={mergeTargetId}>
          <option value="">Select a trail to merge in…</option>
          {#each allTrails as t}
            <option value={t.id}>{trailDisplayNames[t.id] ?? "…"}</option>
          {/each}
        </select>
        <button class="btn-save" onclick={handleMerge} disabled={!mergeTargetId}>Merge</button>
        <button class="btn-cancel" onclick={() => { showMerge = false; mergeTargetId = ""; }}>Cancel</button>
      </div>
    {/if}

    <div class="meta">
      <span>{visits.length} page{visits.length === 1 ? "" : "s"}</span>
      <span>·</span>
      <span>Started {formatDate(trail.startedAt)}</span>
      {#if trail.status === TrailStatus.Active}
        <span class="badge active">Active</span>
      {/if}
    </div>
  </div>

  <!-- Trail note -->
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
    </div>
    <span class="sort-hint">{sortHint}</span>
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
          if ((e.target as HTMLElement).closest("a, button, input, textarea")) return;
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
        if ((e.target as HTMLElement).closest("a, button, input, textarea")) return;
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
            if ((e.target as HTMLElement).closest("a, button, input, textarea")) return;
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
          if ((e.target as HTMLElement).closest("a, button, input, textarea")) return;
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

<style>
  .loading { color: #888; padding: 20px 0; }

  .header { margin-bottom: 16px; }

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

  .title-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 6px;
  }

  .trail-name {
    font-size: 20px;
    font-weight: 700;
    margin: 0;
    flex: 1;
    word-break: break-word;
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
    font-size: 18px;
    font-weight: 600;
    padding: 4px 8px;
    border: 1px solid #0066cc;
    border-radius: 6px;
    outline: none;
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

  .btn-merge-toggle {
    font-size: 12px; padding: 4px 10px;
    border: 1px solid #ddd; border-radius: 6px;
    background: #f8f8f8; cursor: pointer; color: #333;
  }
  .btn-merge-toggle:hover { background: #eee; }

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
  .merge-picker select {
    flex: 1;
    padding: 6px 8px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 13px;
  }

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
    font-size: 12px;
    color: #888;
    flex-wrap: wrap;
  }

  .badge {
    font-size: 10px; padding: 1px 6px; border-radius: 10px; font-weight: 600;
  }
  .badge.active { background: #d4f0d4; color: #2a7a2a; }

  .trail-note-section { margin-bottom: 14px; }
  .trail-note {
    font-size: 13px; color: #333; background: #fffde7;
    border-radius: 6px; padding: 8px 10px; cursor: pointer;
    white-space: pre-wrap; word-break: break-word;
  }
  .trail-note:hover { background: #fff9c4; }
  .trail-note-input {
    width: 100%; box-sizing: border-box; padding: 8px 10px;
    border: 1px solid #ddd; border-radius: 6px;
    font-size: 13px; font-family: inherit; resize: vertical;
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
  .sort-buttons { display: flex; gap: 4px; }
  .sort-btn {
    font-size: 12px; padding: 5px 12px;
    border: 1px solid #ddd; border-radius: 6px;
    background: #f8f8f8; cursor: pointer; color: #555;
    min-width: 90px; height: 28px;
  }
  .sort-btn.active { background: #e8f0fe; color: #0066cc; border-color: #aac4f5; font-weight: 600; }
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
