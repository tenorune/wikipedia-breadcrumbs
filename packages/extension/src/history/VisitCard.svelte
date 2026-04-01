<script lang="ts">
  import type { Visit } from "@wikipedia-breadcrumbs/shared";
  import { formatCitation, CitationFormat } from "@wikipedia-breadcrumbs/shared";

  interface Props {
    visit: Visit;
    trailId: string;
    trailStatus: string;
    onUpdateNote: (visitId: string, note: string) => void;
    onDelete: (visitId: string) => void;
    onSplit?: (position: number) => void;
    onResumed?: () => void;
  }

  let { visit, trailId, trailStatus, onUpdateNote, onDelete, onSplit, onResumed }: Props = $props();

  async function handleTitleClick(e: MouseEvent) {
    e.preventDefault();
    if (trailStatus === "active") {
      // Let the background handle navigation — it knows the real tab ID
      await chrome.runtime.sendMessage({
        type: "navigateActiveTrail",
        trailId,
        url: visit.url,
      });
    } else {
      // Finalized trail — background creates tab and resumes trail atomically
      await chrome.runtime.sendMessage({
        type: "resumeTrailInNewTab",
        trailId,
        url: visit.url,
      });
      onResumed?.();
    }
  }

  let showCitation = $state(false);
  let editingNote = $state(false);
  let noteText = $state(visit.note ?? "");

  function formatTime(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric", month: "long", day: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  }

  function sourceLabel(type: string): string {
    const labels: Record<string, string> = {
      link: "Link", search: "Search", external: "External",
      manual: "Manual", share_target: "Shared",
    };
    return labels[type] ?? type;
  }

  async function copyCitation(format: CitationFormat) {
    const text = formatCitation(visit, format);
    await navigator.clipboard.writeText(text);
    showCitation = false;
  }

  function saveNote() {
    onUpdateNote(visit.id, noteText);
    editingNote = false;
  }

  function autoSaveNote() {
    onUpdateNote(visit.id, noteText);
  }

  const citationFormats = [
    { key: CitationFormat.Wikipedia, label: "Wikipedia" },
    { key: CitationFormat.APA, label: "APA" },
    { key: CitationFormat.MLA, label: "MLA" },
    { key: CitationFormat.Chicago, label: "Chicago" },
    { key: CitationFormat.BibTeX, label: "BibTeX" },
    { key: CitationFormat.Markdown, label: "Markdown" },
    { key: CitationFormat.URL, label: "URL" },
  ];
</script>

<div class="visit-card">
  <div class="main">
    <a href={visit.url} onclick={handleTitleClick} class="title">{visit.title}</a>
    <div class="meta">
      <span class="time">Discovered {formatTime(visit.timestamp)}</span>
      {#if visit.lastVisitedAt && visit.lastVisitedAt !== visit.timestamp}
        <span class="sep">&middot;</span>
        <span class="time">Last visited {formatTime(visit.lastVisitedAt)}</span>
      {/if}
    </div>
  </div>
  {#if editingNote}
    <div class="note-edit">
      <input bind:value={noteText} placeholder="Add a note..." onkeydown={(e) => e.key === "Enter" && saveNote()} onblur={saveNote} oninput={autoSaveNote} />
    </div>
  {:else if visit.note}
    <div class="note-display" onclick={() => { editingNote = true; }}>{visit.note}</div>
  {/if}
  <div class="actions">
    {#if !editingNote && !visit.note}
      <button class="note-btn" onclick={() => { editingNote = true; }}>Add Note</button>
    {/if}
    <button class="cite-btn" onclick={() => showCitation = !showCitation}>Cite</button>
    <button class="delete-btn" onclick={() => onDelete(visit.id)}>Delete</button>
  </div>
  {#if showCitation}
    <div class="citation-picker">
      {#each citationFormats as fmt}
        <button onclick={() => copyCitation(fmt.key)}>{fmt.label}</button>
      {/each}
    </div>
  {/if}
  {#if onSplit}
    <div class="split-divider">
      <hr /><button onclick={() => onSplit(visit.position)}>Split</button>
    </div>
  {/if}
</div>

<style>
  .visit-card { padding: 10px 0; }
  .visit-card:not(:has(.split-divider)) { border-bottom: 1px solid #eee; }
  .visit-card:has(.split-divider) { padding-bottom: 0; }
  .title { color: #0066cc; text-decoration: none; font-size: 15px; font-weight: 500; }
  .title:hover { text-decoration: underline; }
  .meta { font-size: 12px; color: #666; margin-top: 4px; display: flex; gap: 4px; align-items: center; }
  .sep { color: #999; }
  .badge { background: #e8f0fe; color: #1a73e8; padding: 1px 6px; border-radius: 3px; font-size: 11px; }
  .detail { font-style: italic; }
  .actions { display: flex; gap: 8px; margin-top: 6px; }
  .note-display { font-size: 12px; color: #333; cursor: pointer; text-align: left; margin-top: 6px; }
  .note-display:hover { color: #0066cc; }
  .note-btn, .cite-btn, .delete-btn { font-size: 12px; padding: 2px 8px; border: 1px solid #ddd; border-radius: 3px; background: white; cursor: pointer; }
  .delete-btn:hover { border-color: #dc3545; color: #dc3545; }
  .split-divider { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
  .split-divider hr { flex: 1; border: none; border-top: 1px solid #eee; margin: 0; }
  .split-divider button { font-size: 11px; padding: 1px 8px; border: 1px solid #ddd; border-radius: 3px; background: white; cursor: pointer; color: #999; flex-shrink: 0; }
  .split-divider button:hover { border-color: #0066cc; color: #0066cc; }
  .note-edit { display: flex; gap: 4px; }
  .note-edit input { font-size: 12px; padding: 2px 6px; border: 1px solid #ccc; border-radius: 3px; width: 200px; }
  .citation-picker { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
  .citation-picker button { font-size: 12px; padding: 3px 10px; border: 1px solid #ddd; border-radius: 3px; background: #f8f8f8; cursor: pointer; }
  .citation-picker button:hover { background: #e8f0fe; }
</style>
