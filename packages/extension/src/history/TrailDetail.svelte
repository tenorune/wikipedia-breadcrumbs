<script lang="ts">
  import { onMount } from "svelte";
  import type { Trail, Visit, LanguageBadgeSettings } from "@wikipedia-breadcrumbs/shared";
  import { BreadcrumbsDB, visitStore, trailStore, splitTrail, mergeTrails, exportTrailsJson, exportTrailsCsv, downloadFile, exportFilename, getLanguageBadgeSettings, shouldShowLanguageBadge } from "@wikipedia-breadcrumbs/shared";
  import VisitCard from "./VisitCard.svelte";
  import ConfirmDialog from "./ConfirmDialog.svelte";

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
  let detailMenuOpen = $state(false);
  let langSettings: LanguageBadgeSettings | null = $state(null);

  $effect(() => {
    if (!detailMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".detail-menu-wrap")) detailMenuOpen = false;
    };
    setTimeout(() => document.addEventListener("click", close));
    return () => document.removeEventListener("click", close);
  });

  let mergeOptions: { trail: Trail; label: string }[] = $state([]);
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
  let editingNote = $state(false);
  let trailNote = $state(trail.note ?? "");
  let focusedVisitId: string | null = $state(null);

  $effect(() => {
    if (!editingName && !editingNote) return;
    const stamp = () => { (window as any).__dismissTime = Date.now(); };
    document.addEventListener("mousedown", stamp, true);
    return () => document.removeEventListener("mousedown", stamp, true);
  });
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

  // When a visit is focused, show it as "parent" with pages discovered from it as "children".
  // Uses the explicit parentVisitId field set during capture.
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
    // Skip if a dropdown/textarea was just dismissed (event still bubbling)
    if ((window as any).__dismissTime && Date.now() - (window as any).__dismissTime < 300) return;
    focusedVisitId = focusedVisitId === visitId ? null : visitId;
  }

  const db = new BreadcrumbsDB();
  const visitOps = visitStore(db);
  const trailOps = trailStore(db);

  async function loadVisits() {
    if (!trail?.id) return;
    visits = await visitOps.getByTrailId(trail.id);
  }

  // Refresh when tab becomes visible
  onMount(() => {
    const onVisible = () => { if (document.visibilityState === "visible") loadVisits(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  });

  async function saveName() {
    if (nameText.trim()) {
      await trailOps.update(trail.id, { name: nameText.trim() });
      displayName = nameText.trim();
      chrome.runtime.sendMessage({ type: "trailMutated", trailId: trail.id });
    }
    editingName = false;
    (window as any).__dismissTime = Date.now();
  }

  async function autoSaveName() {
    if (nameText.trim()) {
      await trailOps.update(trail.id, { name: nameText.trim() });
      displayName = nameText.trim();
    }
  }

  async function toggleStar() {
    isStarred = !isStarred;
    await trailOps.update(trail.id, { isStarred });
  }

  let confirmState = $state<{ message: string; confirmLabel: string; action: () => void } | null>(null);

  async function handleSplit(afterPosition: number) {
    confirmState = {
      message: "Split trail here? Visits after this point will become a new trail.",
      confirmLabel: "Split",
      action: async () => { await doSplit(afterPosition); },
    };
  }

  async function doSplit(afterPosition: number) {
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
    (window as any).__dismissTime = Date.now();
  }

  async function autoSaveNote() {
    await trailOps.update(trail.id, { note: trailNote.trim() || null });
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

  async function handleMerge() {
    if (!mergeTargetId) return;
    const label = mergeOptions.find((o) => o.trail.id === mergeTargetId)?.label ?? "this trail";
    const targetId = mergeTargetId;
    confirmState = {
      message: `Merge "${label}" into this trail? The other trail will be deleted.`,
      confirmLabel: "Merge",
      action: async () => {
        await mergeTrails(db, trail.id, targetId);
        chrome.runtime.sendMessage({ type: "trailMutated", trailId: trail.id });
        chrome.runtime.sendMessage({ type: "trailDeleted", trailId: targetId });
        showMergePicker = false;
        mergeTargetId = "";
        onMutated();
      },
    };
  }

  async function handleDetailExport(format: "json" | "csv") {
    detailMenuOpen = false;
    const content = format === "json"
      ? await exportTrailsJson(db, [trail.id])
      : await exportTrailsCsv(db, [trail.id]);
    downloadFile(content, exportFilename(trail.name, format), format === "json" ? "application/json" : "text/csv");
  }

  async function handleUpdateNote(visitId: string, note: string) {
    await visitOps.update(visitId, { note });
    await loadVisits();
  }

  async function handleDeleteVisit(visitId: string) {
    confirmState = {
      message: "Delete this visit?",
      confirmLabel: "Delete",
      action: async () => { await visitOps.softDelete(visitId); await loadVisits(); },
    };
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  }

  loadVisits();
  getLanguageBadgeSettings(db).then((s) => { langSettings = s; });
</script>

<div class="trail-detail">
  <button class="back" onclick={onBack}>&larr; Back to trails</button>

  <div class="header-box">
    <button class="star" class:starred={isStarred} onclick={toggleStar} aria-label={isStarred ? "Unstar" : "Star"}>{isStarred ? "★" : "☆"}</button>
    <div class="header-content">
      <div class="title-row">
        {#if editingName}
          <!-- svelte-ignore a11y_autofocus -->
          <input bind:value={nameText} onkeydown={(e) => e.key === "Enter" && saveName()} onblur={saveName} oninput={autoSaveName} autofocus aria-label="Trail name" />
        {:else}
          <h2 role="button" tabindex="0" onclick={() => { editingName = true; nameText = displayName ?? ""; }} onkeydown={(e) => { if (e.key === "Enter") { editingName = true; nameText = displayName ?? ""; } }}>
            {displayName ?? (visits.length > 0 ? `${visits[0].title} → ${visits[visits.length - 1].title}` : "New trail")}
          </h2>
        {/if}
        <div class="detail-menu-wrap">
          <button class="detail-menu-btn" onclick={() => { detailMenuOpen = !detailMenuOpen; }} title="Actions" aria-label="Actions">⋮</button>
          {#if detailMenuOpen}
            <div class="detail-menu">
              <button onclick={() => { detailMenuOpen = false; openMergePicker(); }}>Merge</button>
              <button onclick={() => handleDetailExport("json")}>Export JSON</button>
              <button onclick={() => handleDetailExport("csv")}>Export CSV</button>
            </div>
          {/if}
        </div>
      </div>
      <div class="meta">
        <span>{visits.length} pages</span>
        <span> &middot; Started {formatDate(trail.startedAt)}{#if visits.length > 0 && formatDate(trail.startedAt) !== formatDate(visits[visits.length - 1].timestamp)}{" "}&mdash; {formatDate(visits[visits.length - 1].timestamp)}{/if}</span>
        {#if trail.status === "active"}<span class="active-badge">Active</span>{/if}
      </div>
      <div class="note-section">
        {#if editingNote}
          <!-- svelte-ignore a11y_autofocus -->
          <textarea bind:value={trailNote} placeholder="Add a note about this trail..." rows="3" aria-label="Trail note"
            onblur={saveNote} oninput={autoSaveNote} autofocus></textarea>
        {:else if trailNote}
          <p class="trail-note" role="button" tabindex="0" onclick={() => editingNote = true} onkeydown={(e) => e.key === "Enter" && (editingNote = true)}>{trailNote}</p>
        {:else}
          <button class="add-note" onclick={() => editingNote = true}>+ Add trail note</button>
        {/if}
      </div>
    </div>
  </div>

  {#if showMergePicker}
    <div class="merge-picker">
      <div class="merge-dropdown-wrap">
        <button class="merge-dropdown-btn" onclick={() => { mergeDropdownOpen = !mergeDropdownOpen; }}>
          <span class="merge-dropdown-label">{mergeTargetLabel}</span>
          <span class="merge-dropdown-arrow" aria-hidden="true">▾</span>
        </button>
        {#if mergeDropdownOpen}
          <div class="merge-dropdown">
            {#each mergeOptions as option}
              <button class:selected={mergeTargetId === option.trail.id} onclick={() => {
                mergeTargetId = option.trail.id;
                mergeTargetLabel = option.label;
                mergeDropdownOpen = false;
              }}>{option.label}</button>
            {/each}
          </div>
        {/if}
      </div>
      <button class="btn-merge" onclick={handleMerge} disabled={!mergeTargetId}>Merge</button>
      <button class="btn-cancel" onclick={() => { showMergePicker = false; mergeTargetId = ""; mergeTargetLabel = "Select a trail…"; }}>Cancel</button>
    </div>
  {/if}

  <div class="sort-bar">
    <button class:active={sortField === "discovery"} onclick={() => {
      if (focusedView) { focusedVisitId = null; }
      else { toggleSort("discovery"); }
    }}>Discovery {focusedView ? "◎" : sortField === "discovery" ? (sortAsc ? "↑" : "↓") : ""}</button>
    <button class:active={sortField === "visited"} onclick={() => toggleSort("visited")}>Visited {sortField === "visited" ? (sortAsc ? "↑" : "↓") : ""}</button>
    <span class="sort-hint">{focusedView ? "focused view" : sortAsc ? "oldest to newest" : "newest to oldest"}</span>
  </div>

  <hr class="timeline-start" />
  <div class="timeline">
    {#if focusedView}
      {#if focusedView.parent}
        <div class="visit-wrapper focused-grandparent" onclick={(e) => {
          if ((e.target as HTMLElement).closest("a, button, input, textarea, .note-display, .card-menu-wrap, .cite-wrap, .note-edit")) return;
          toggleFocus(focusedView.parent!.id);
        }}>
          <!-- <div class="grandparent-label">Discovered from</div> -->
          <VisitCard
            visit={focusedView.parent}
            trailId={trail.id}
            trailStatus={trail.status}
            onUpdateNote={handleUpdateNote}
            onDelete={handleDeleteVisit}
            onResumed={onMutated}
            showLanguageBadge={langSettings ? shouldShowLanguageBadge(focusedView.parent.language, langSettings) : false}
          />
        </div>
      {/if}
      <div class="visit-wrapper focused-current" onclick={(e) => {
        if ((e.target as HTMLElement).closest("a, button, input, textarea, .note-display, .card-menu-wrap, .cite-wrap, .note-edit")) return;
        toggleFocus(focusedView.focused.id);
      }}>
        <VisitCard
          visit={focusedView.focused}
          trailId={trail.id}
          trailStatus={trail.status}
          onUpdateNote={handleUpdateNote}
          onDelete={handleDeleteVisit}
          onResumed={onMutated}
          showLanguageBadge={langSettings ? shouldShowLanguageBadge(focusedView.focused.language, langSettings) : false}
        />
      </div>
      {#if focusedView.children.length > 0}
        <!-- <div class="children-label">Discovered from this page</div> -->
        {#each focusedView.children as child}
          <div class="visit-wrapper focused-child" onclick={(e) => {
            if ((e.target as HTMLElement).closest("a, button, input, textarea, .note-display, .card-menu-wrap, .cite-wrap, .note-edit")) return;
            toggleFocus(child.id);
          }}>
            <VisitCard
              visit={child}
              trailId={trail.id}
              trailStatus={trail.status}
              onUpdateNote={handleUpdateNote}
              onDelete={handleDeleteVisit}
              onResumed={onMutated}
              showLanguageBadge={langSettings ? shouldShowLanguageBadge(child.language, langSettings) : false}
            />
          </div>
        {/each}
      {:else}
        <p class="no-children">No pages were discovered from this page.</p>
      {/if}
    {:else}
      {#each sortedVisits as visit, i}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="visit-wrapper" class:focusable={sortField === "discovery"} onclick={(e) => {
          // Don't trigger focus when clicking links, buttons, or inputs
          const target = e.target as HTMLElement;
          if (target.closest("a, button, input, textarea, .note-display, .card-menu-wrap, .cite-wrap, .note-edit")) return;
          if (sortField === "discovery") toggleFocus(visit.id);
        }}>
          <VisitCard
            {visit}
            trailId={trail.id}
            trailStatus={trail.status}
            onUpdateNote={handleUpdateNote}
            onDelete={handleDeleteVisit}
            onSplit={sortField === "discovery" && sortAsc && i < sortedVisits.length - 1 ? handleSplit : undefined}
            onResumed={onMutated}
            showLanguageBadge={langSettings ? shouldShowLanguageBadge(visit.language, langSettings) : false}
          />
        </div>
      {/each}
    {/if}
  </div>


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
  .trail-detail { }
  .back { background: none; border: none; color: #0066cc; cursor: pointer; padding: 0; margin-bottom: 16px; font-size: 14px; }
  .header-box {
    display: flex; gap: 10px; padding: 12px; border: 1px solid #eee; border-radius: 6px;
    margin-bottom: 12px; align-items: start; position: relative;
  }
  .star { background: none; border: none; font-size: 20px; cursor: pointer; padding: 0; flex-shrink: 0; color: #ccc; }
  .star.starred { color: #f5a623; }
  .header-content { flex: 1; min-width: 0; padding-right: 20px; }
  .title-row { display: flex; align-items: center; gap: 8px; }
  .title-row h2 { margin: 0; cursor: pointer; flex: 1; word-break: break-word; line-height: 1.3; }
  .title-row h2:hover { color: #0066cc; }
  .detail-menu-wrap { position: absolute; top: 8px; right: 8px; }
  .detail-menu-btn { background: none; border: none; font-size: 16px; cursor: pointer; padding: 0 4px; color: #999; line-height: 1; }
  .detail-menu-btn:hover { color: #333; }
  .detail-menu {
    position: absolute; top: calc(100% + 4px); right: 0; background: white;
    border: 1px solid #ddd; border-radius: 6px; padding: 4px 0; z-index: 50;
    min-width: 140px; box-shadow: 0 4px 12px rgba(0,0,0,0.12);
  }
  .detail-menu button { display: block; width: 100%; text-align: left; padding: 6px 12px; border: none; background: none; cursor: pointer; font-size: 12px; color: #222; }
  .detail-menu button:hover { background: #f5f5f5; }
  .meta { font-size: 13px; color: #666; margin-top: 4px; }
  .sort-bar { display: flex; align-items: center; gap: 6px; margin-bottom: 12px; font-size: 13px; color: #666; }
  .sort-bar button { padding: 5px 12px; border: 1px solid #ddd; border-radius: 6px; background: #f8f8f8; cursor: pointer; font-size: 12px; color: #555; min-width: 90px; height: 28px; }
  .sort-bar button.active { background: #e8f0fe; border-color: #aac4f5; color: #0066cc; }
  .sort-hint { color: #999; }
  .meta { font-size: 13px; color: #666; margin: 8px 0 12px; }
  .timeline-start { border: none; border-top: 1px solid #eee; margin: 14px 0 12px -8px; }
  .visit-wrapper { padding: 0 0 0 8px; margin-left: -16px; }
  .visit-wrapper.focusable { cursor: pointer; }
  .visit-wrapper.focusable:hover :global(.card-body) { background: #fafafa; margin-right: 0; }
  .focused-grandparent { opacity: 0.6; cursor: pointer; }
  .focused-grandparent:hover { opacity: 0.8; }
  .focused-grandparent :global(.card-body) { margin-right: 0; }
  .grandparent-label { font-size: 11px; color: #888; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
  .focused-current { cursor: pointer; }
  .focused-current :global(.card-body) { background: #f0f7ff; margin-right: 0; }
  .focused-current:hover :global(.card-body) { background: #e4effa; }
  .children-label { font-size: 11px; color: #666; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin: 12px 0 4px 16px; }
  .focused-child { margin-left: 16px; border-left: 2px solid #0066cc; padding-left: 12px; cursor: pointer; }
  .focused-child :global(.card-body) { margin-right: 0; }
  .focused-child:hover :global(.card-body) { background: #fafafa; }
  .no-children { font-size: 13px; color: #999; margin: 12px 0 0 0; }
  .note-section { margin-top: 6px; }
  .trail-note { margin: 0; padding: 8px 12px; background: #f8f8f8; border-radius: 4px; cursor: pointer; font-size: 14px; color: #333; white-space: pre-wrap; }
  .trail-note:hover { background: #f0f0f0; }
  .add-note { background: none; border: none; cursor: pointer; color: #0066cc; font-size: 13px; padding: 0; }
  .add-note:hover { text-decoration: underline; }
  textarea { width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; font-family: inherit; resize: vertical; box-sizing: border-box; }
  .note-actions { display: flex; gap: 8px; margin-top: 6px; }
  .cancel-note { background: none; border: 1px solid #ddd; border-radius: 3px; padding: 4px 10px; cursor: pointer; color: #666; }
  .active-badge { background: #d4edda; color: #155724; padding: 1px 6px; border-radius: 3px; font-size: 11px; margin-left: 4px; }
  .merge-picker {
    display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
    margin-bottom: 12px; padding: 10px;
    background: #f8f8f8; border-radius: 6px; border: 1px solid #e0e0e0;
  }
  .merge-dropdown-wrap { position: relative; flex: 1; min-width: 0; }
  .merge-dropdown-btn {
    width: 100%; padding: 6px 8px; border: 1px solid #ddd; border-radius: 4px;
    background: white; cursor: pointer; font-size: 13px; text-align: left;
    display: flex; justify-content: space-between; align-items: center;
  }
  .merge-dropdown-btn:hover { border-color: #bbb; }
  .merge-dropdown-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .merge-dropdown-arrow { color: #555; flex-shrink: 0; margin-left: 8px; }
  .merge-dropdown {
    position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: white;
    border: 1px solid #ddd; border-radius: 6px; padding: 4px 0; z-index: 50;
    max-height: 200px; overflow-y: auto; box-shadow: 0 4px 12px rgba(0,0,0,0.12);
  }
  .merge-dropdown button {
    display: block; width: 100%; text-align: left; padding: 6px 10px;
    border: none; background: none; cursor: pointer; font-size: 12px; color: #222;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .merge-dropdown button:hover { background: #f5f5f5; }
  .merge-dropdown button.selected { background: #e8f0fe; color: #0066cc; }
  .btn-merge { padding: 6px 12px; background: #0066cc; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; }
  .btn-merge:disabled { opacity: 0.5; cursor: default; }
  .btn-cancel { padding: 6px 12px; background: #eee; color: #333; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; }
  .title-row input { font-size: 1.5em; font-weight: bold; padding: 0; margin: 0; border: none; box-shadow: 0 2px 0 #0066cc; border-radius: 0; outline: none; flex: 1; width: 100%; line-height: 1.3; }
</style>
