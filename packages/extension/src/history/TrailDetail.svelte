<script lang="ts">
  import type { Trail, Visit } from "@wikipedia-breadcrumbs/shared";
  import { BreadcrumbsDB, visitStore, trailStore, splitTrail, mergeTrails } from "@wikipedia-breadcrumbs/shared";
  import VisitCard from "./VisitCard.svelte";

  interface Props {
    trail: Trail;
    onBack: () => void;
    onMutated: () => void;
  }

  let { trail, onBack, onMutated }: Props = $props();

  let visits: Visit[] = $state([]);
  let editingName = $state(false);
  let nameText = $state(trail.name ?? "");
  let isStarred = $state(trail.isStarred);
  let displayName = $state(trail.name);
  let showMergePicker = $state(false);
  let mergeOptions: { trail: Trail; label: string }[] = $state([]);
  let editingNote = $state(false);
  let trailNote = $state(trail.note ?? "");
  // Persist sort preferences across trail detail views
  function loadSortPrefs() {
    try {
      const saved = localStorage.getItem("trailDetailSort");
      if (saved) return JSON.parse(saved);
    } catch {}
    return { field: "discovery", discoveryAsc: true, visitedAsc: true };
  }

  function saveSortPrefs() {
    localStorage.setItem("trailDetailSort", JSON.stringify({
      field: sortField,
      discoveryAsc,
      visitedAsc,
    }));
  }

  const prefs = loadSortPrefs();
  let sortField: "discovery" | "visited" = $state(prefs.field);
  let discoveryAsc: boolean = $state(prefs.discoveryAsc);
  let visitedAsc: boolean = $state(prefs.visitedAsc);

  const sortAsc = $derived(sortField === "discovery" ? discoveryAsc : visitedAsc);

  function toggleSort(field: "discovery" | "visited") {
    if (sortField === field) {
      if (field === "discovery") discoveryAsc = !discoveryAsc;
      else visitedAsc = !visitedAsc;
    } else {
      sortField = field;
    }
    saveSortPrefs();
  }

  const sortedVisits = $derived.by(() => {
    let result: Visit[];
    if (sortField === "visited") {
      result = [...visits].sort((a, b) => (a.lastVisitedAt ?? a.timestamp).localeCompare(b.lastVisitedAt ?? b.timestamp));
    } else {
      // Discovery order — by position (which reflects order of first encounter)
      result = [...visits];
    }
    if (!sortAsc) result = result.reverse();
    return result;
  });

  const db = new BreadcrumbsDB();
  const visitOps = visitStore(db);
  const trailOps = trailStore(db);

  async function loadVisits() {
    visits = await visitOps.getByTrailId(trail.id);
  }

  // Refresh when tab becomes visible
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") loadVisits();
  });

  async function saveName() {
    if (nameText.trim()) {
      await trailOps.update(trail.id, { name: nameText.trim() });
      displayName = nameText.trim();
      chrome.runtime.sendMessage({ type: "trailMutated", trailId: trail.id });
    }
    editingName = false;
  }

  async function toggleStar() {
    isStarred = !isStarred;
    await trailOps.update(trail.id, { isStarred });
  }

  async function handleSplit(afterPosition: number) {
    const [originalId, newTrailId] = await splitTrail(db, trail.id, afterPosition);
    const isActive = trail.status === "active";

    if (isActive) {
      // Navigate the old trail's tab to its new last page
      const oldVisits = await visitOps.getByTrailId(originalId);
      const oldLastVisit = oldVisits[oldVisits.length - 1];
      if (oldLastVisit) {
        await chrome.runtime.sendMessage({
          type: "navigateActiveTrail",
          trailId: originalId,
          url: oldLastVisit.url,
        });
      }
    }
    chrome.runtime.sendMessage({ type: "trailMutated", trailId: originalId });

    // Open the new trail's last page in a new tab
    const newVisits = await visitOps.getByTrailId(newTrailId);
    const newLastVisit = newVisits[newVisits.length - 1];
    if (newLastVisit) {
      await chrome.runtime.sendMessage({
        type: "resumeTrailInNewTab",
        trailId: newTrailId,
        url: newLastVisit.url,
      });
    }

    onMutated();
  }

  async function saveNote() {
    await trailOps.update(trail.id, { note: trailNote.trim() || null });
    editingNote = false;
  }

  async function openMergePicker() {
    const others = (await trailOps.getAll()).filter((t) => t.id !== trail.id);
    const options: { trail: Trail; label: string }[] = [];
    for (const t of others) {
      if (t.name) {
        options.push({ trail: t, label: t.name });
      } else {
        const v = await visitOps.getByTrailId(t.id);
        const first = v[0]?.title ?? "";
        const last = v[v.length - 1]?.title ?? "";
        options.push({ trail: t, label: first ? `${first} → ${last}` : "Empty trail" });
      }
    }
    mergeOptions = options;
    showMergePicker = true;
  }

  async function handleMerge(secondaryId: string) {
    await mergeTrails(db, trail.id, secondaryId);
    chrome.runtime.sendMessage({ type: "trailMutated", trailId: trail.id });
    chrome.runtime.sendMessage({ type: "trailDeleted", trailId: secondaryId });
    showMergePicker = false;
    onMutated();
  }

  async function handleUpdateNote(visitId: string, note: string) {
    await visitOps.update(visitId, { note });
    await loadVisits();
  }

  async function handleDeleteVisit(visitId: string) {
    await visitOps.softDelete(visitId);
    await loadVisits();
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString();
  }

  loadVisits();
</script>

<div class="trail-detail">
  <button class="back" onclick={onBack}>&larr; Back to trails</button>

  <div class="header">
    {#if editingName}
      <input bind:value={nameText} onkeydown={(e) => e.key === "Enter" && saveName()} autofocus />
      <button onclick={saveName}>Save</button>
    {:else}
      <h2 onclick={() => { editingName = true; nameText = displayName ?? ""; }}>
        {displayName ?? (visits.length > 0 ? `${visits[0].title} → ${visits[visits.length - 1].title}` : "New trail")}
      </h2>
    {/if}
    <button class="star" onclick={toggleStar}>{isStarred ? "★" : "☆"}</button>
    <button class="merge-btn" onclick={openMergePicker}>Merge</button>
  </div>

  <div class="meta">
    <span>{formatDate(trail.startedAt)}</span>
    {#if trail.endedAt}<span> — {formatDate(trail.endedAt)}</span>{/if}
    <span> &middot; {visits.length} pages</span>
    <span class="status">{trail.status}</span>
  </div>

  <div class="note-section">
    {#if editingNote}
      <textarea bind:value={trailNote} placeholder="Add a note about this trail..." rows="3"></textarea>
      <div class="note-actions">
        <button onclick={saveNote}>Save</button>
        <button class="cancel-note" onclick={() => { editingNote = false; trailNote = trail.note ?? ""; }}>Cancel</button>
      </div>
    {:else if trailNote}
      <p class="trail-note" onclick={() => editingNote = true}>{trailNote}</p>
    {:else}
      <button class="add-note" onclick={() => editingNote = true}>+ Add note</button>
    {/if}
  </div>

  <div class="sort-bar">
    <span>Sort by:</span>
    <button class:active={sortField === "discovery"} onclick={() => toggleSort("discovery")}>Discovery {sortField === "discovery" ? (sortAsc ? "▲" : "▼") : ""}</button>
    <button class:active={sortField === "visited"} onclick={() => toggleSort("visited")}>Visited {sortField === "visited" ? (sortAsc ? "▲" : "▼") : ""}</button>
    <span class="sort-hint">{sortAsc ? "oldest to newest" : "newest to oldest"}</span>
  </div>

  <div class="timeline">
    {#each sortedVisits as visit, i}
      <VisitCard
        {visit}
        trailId={trail.id}
        trailStatus={trail.status}
        onUpdateNote={handleUpdateNote}
        onDelete={handleDeleteVisit}
        onSplit={sortField === "discovery" && sortAsc && i < sortedVisits.length - 1 ? handleSplit : undefined}
        onResumed={onMutated}
      />
    {/each}
  </div>

  {#if showMergePicker}
    <div class="merge-picker">
      <h3>Merge with another trail:</h3>
      {#each mergeOptions as option}
        <button onclick={() => handleMerge(option.trail.id)}>
          {option.label}
        </button>
      {/each}
      <button class="cancel" onclick={() => showMergePicker = false}>Cancel</button>
    </div>
  {/if}
</div>

<style>
  .trail-detail { max-width: 700px; }
  .back { background: none; border: none; color: #0066cc; cursor: pointer; padding: 0; margin-bottom: 16px; }
  .header { display: flex; align-items: center; gap: 12px; }
  .header h2 { margin: 0; cursor: pointer; }
  .header h2:hover { color: #0066cc; }
  .star { background: none; border: none; font-size: 20px; cursor: pointer; }
  .merge-btn { background: none; border: 1px solid #ddd; border-radius: 3px; padding: 4px 10px; cursor: pointer; font-size: 13px; }
  .sort-bar { display: flex; align-items: center; gap: 6px; margin-bottom: 12px; font-size: 13px; color: #666; }
  .sort-bar button { padding: 3px 10px; border: 1px solid #ddd; border-radius: 3px; background: white; cursor: pointer; font-size: 12px; }
  .sort-bar button.active { background: #e8f0fe; border-color: #1a73e8; color: #1a73e8; }
  .sort-hint { font-style: italic; color: #999; }
  .meta { font-size: 13px; color: #666; margin: 8px 0 12px; }
  .note-section { margin-bottom: 16px; }
  .trail-note { margin: 0; padding: 8px 12px; background: #f8f8f8; border-radius: 4px; cursor: pointer; font-size: 14px; color: #333; white-space: pre-wrap; }
  .trail-note:hover { background: #f0f0f0; }
  .add-note { background: none; border: 1px dashed #ccc; border-radius: 4px; padding: 6px 12px; cursor: pointer; color: #999; font-size: 13px; }
  .add-note:hover { border-color: #0066cc; color: #0066cc; }
  textarea { width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; font-family: inherit; resize: vertical; box-sizing: border-box; }
  .note-actions { display: flex; gap: 8px; margin-top: 6px; }
  .cancel-note { background: none; border: 1px solid #ddd; border-radius: 3px; padding: 4px 10px; cursor: pointer; color: #666; }
  .status { background: #e8f0fe; padding: 1px 6px; border-radius: 3px; font-size: 11px; }
  .merge-picker { margin-top: 16px; padding: 12px; border: 1px solid #ddd; border-radius: 4px; }
  .merge-picker h3 { margin: 0 0 8px; font-size: 14px; }
  .merge-picker button { display: block; width: 100%; text-align: left; padding: 6px 10px; margin: 4px 0; border: 1px solid #eee; border-radius: 3px; background: white; cursor: pointer; }
  .merge-picker button:hover { background: #f0f0f0; }
  .merge-picker .cancel { text-align: center; color: #999; border-style: dashed; }
  input { font-size: 16px; padding: 4px 8px; border: 1px solid #0066cc; border-radius: 4px; }
</style>
