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
  let allTrails: Trail[] = $state([]);
  let editingNote = $state(false);
  let trailNote = $state(trail.note ?? "");

  const db = new BreadcrumbsDB();
  const visitOps = visitStore(db);
  const trailOps = trailStore(db);

  const lastTabId = $derived(visits.length > 0 ? visits[visits.length - 1].tabId : null);

  async function loadVisits() {
    visits = await visitOps.getByTrailId(trail.id);
  }

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
    await splitTrail(db, trail.id, afterPosition);
    chrome.runtime.sendMessage({ type: "trailMutated", trailId: trail.id });
    onMutated();
  }

  async function saveNote() {
    await trailOps.update(trail.id, { note: trailNote.trim() || null });
    editingNote = false;
  }

  async function openMergePicker() {
    allTrails = (await trailOps.getAll()).filter((t) => t.id !== trail.id);
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
        {displayName ?? `Trail (${visits.length} pages)`}
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

  <div class="timeline">
    {#each visits as visit, i}
      <VisitCard {visit} trailStatus={trail.status} trailTabId={lastTabId} onUpdateNote={handleUpdateNote} />
      {#if i < visits.length - 1}
        <button class="split-btn" onclick={() => handleSplit(visit.position)}>
          Split here
        </button>
      {/if}
    {/each}
  </div>

  {#if showMergePicker}
    <div class="merge-picker">
      <h3>Merge with another trail:</h3>
      {#each allTrails as other}
        <button onclick={() => handleMerge(other.id)}>
          {other.name ?? `Trail from ${new Date(other.startedAt).toLocaleDateString()}`}
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
  .split-btn { display: block; width: 100%; text-align: center; padding: 4px; border: 1px dashed #ddd; background: none; cursor: pointer; font-size: 12px; color: #999; margin: 2px 0; }
  .split-btn:hover { border-color: #0066cc; color: #0066cc; }
  .merge-picker { margin-top: 16px; padding: 12px; border: 1px solid #ddd; border-radius: 4px; }
  .merge-picker h3 { margin: 0 0 8px; font-size: 14px; }
  .merge-picker button { display: block; width: 100%; text-align: left; padding: 6px 10px; margin: 4px 0; border: 1px solid #eee; border-radius: 3px; background: white; cursor: pointer; }
  .merge-picker button:hover { background: #f0f0f0; }
  .merge-picker .cancel { text-align: center; color: #999; border-style: dashed; }
  input { font-size: 16px; padding: 4px 8px; border: 1px solid #0066cc; border-radius: 4px; }
</style>
