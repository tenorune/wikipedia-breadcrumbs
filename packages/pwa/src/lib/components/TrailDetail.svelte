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

  const SORT_KEY = `trailDetail_sort_${trailId}`;

  function loadSortPrefs(): { field: SortField; dir: SortDir } {
    try {
      const stored = localStorage.getItem(SORT_KEY);
      if (stored) return JSON.parse(stored);
    } catch {}
    return { field: "discovery", dir: "asc" };
  }

  let sortField = $state<SortField>("discovery");
  let sortDir = $state<SortDir>("asc");

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

  const sortHint = $derived(
    sortDir === "asc" ? "oldest to newest" : "newest to oldest"
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

  async function saveNote() {
    if (!trail) return;
    const v = noteValue.trim() || null;
    await ts.update(trail.id, { note: v });
    editingNote = false;
    await loadData();
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
        <input
          class="name-input"
          type="text"
          bind:value={nameValue}
          placeholder="Trail name"
          onkeydown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") { editingName = false; } }}
        />
        <button class="btn-save" onclick={saveName}>Save</button>
        <button class="btn-cancel" onclick={() => { editingName = false; }}>Cancel</button>
      {:else}
        <h1 class="trail-name" role="button" tabindex="0"
          onclick={() => { editingName = true; nameValue = trail?.name ?? ""; }}
          onkeydown={(e) => e.key === "Enter" && (editingName = true)}
          title="Click to edit name"
        >
          {trailDisplayName}
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
      <textarea
        class="trail-note-input"
        rows="3"
        bind:value={noteValue}
        placeholder="Add a note about this trail…"
        onkeydown={(e) => { if (e.key === "Escape") { editingNote = false; } }}
      ></textarea>
      <div class="note-actions">
        <button class="btn-save" onclick={saveNote}>Save</button>
        <button class="btn-cancel" onclick={() => { editingNote = false; }}>Cancel</button>
      </div>
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
        onclick={() => setSortField("discovery")}
      >
        Discovery {sortField === "discovery" ? (sortDir === "asc" ? "↑" : "↓") : ""}
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
    {:else}
      {#each sortedVisits as visit, i (visit.id)}
        <VisitCard
          {visit}
          onUpdateNote={handleUpdateNote}
          onDelete={handleDeleteVisit}
          onSplit={showSplit && i < sortedVisits.length - 1 ? handleSplit : undefined}
        />
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
    cursor: pointer;
    flex: 1;
    word-break: break-word;
  }
  .trail-name:hover { text-decoration: underline; }

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
  .note-actions { display: flex; gap: 6px; margin-top: 4px; }
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
  }
  .sort-btn.active { background: #e8f0fe; color: #0066cc; border-color: #aac4f5; font-weight: 600; }
  .sort-hint { font-size: 11px; color: #aaa; }

  .visits { display: flex; flex-direction: column; gap: 8px; }
  .empty { color: #888; font-size: 13px; }
</style>
