<script lang="ts">
  import type { Visit } from "@wikipedia-breadcrumbs/shared";
  import { formatCitation, CitationFormat } from "@wikipedia-breadcrumbs/shared";

  interface Props {
    visit: Visit;
    trailId: string;
    trailStatus: string;
    trailTabId: number | null;
    onUpdateNote: (visitId: string, note: string) => void;
    onResumed?: () => void;
  }

  let { visit, trailId, trailStatus, trailTabId, onUpdateNote, onResumed }: Props = $props();

  async function handleTitleClick(e: MouseEvent) {
    e.preventDefault();
    if (trailStatus === "active" && trailTabId != null) {
      // Switch to the trail's tab and navigate to the clicked page
      try {
        await chrome.tabs.update(trailTabId, { active: true, url: visit.url });
        const tab = await chrome.tabs.get(trailTabId);
        if (tab.windowId != null) {
          await chrome.windows.update(tab.windowId, { focused: true });
        }
      } catch {
        chrome.tabs.create({ url: visit.url });
      }
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
    return new Date(iso).toLocaleString();
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
      <span class="time">{formatTime(visit.timestamp)}</span>
    </div>
  </div>
  <div class="actions">
    {#if editingNote}
      <div class="note-edit">
        <input bind:value={noteText} placeholder="Add a note..." onkeydown={(e) => e.key === "Enter" && saveNote()} />
        <button onclick={saveNote}>Save</button>
      </div>
    {:else}
      <button class="note-btn" onclick={() => { editingNote = true; }}>
        {visit.note ? `Note: ${visit.note}` : "Add note"}
      </button>
    {/if}
    <button class="cite-btn" onclick={() => showCitation = !showCitation}>Cite</button>
  </div>
  {#if showCitation}
    <div class="citation-picker">
      {#each citationFormats as fmt}
        <button onclick={() => copyCitation(fmt.key)}>{fmt.label}</button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .visit-card { padding: 10px 0; border-bottom: 1px solid #eee; }
  .title { color: #0066cc; text-decoration: none; font-size: 15px; font-weight: 500; }
  .title:hover { text-decoration: underline; }
  .meta { font-size: 12px; color: #666; margin-top: 4px; display: flex; gap: 8px; align-items: center; }
  .badge { background: #e8f0fe; color: #1a73e8; padding: 1px 6px; border-radius: 3px; font-size: 11px; }
  .detail { font-style: italic; }
  .actions { display: flex; gap: 8px; margin-top: 6px; }
  .note-btn, .cite-btn { font-size: 12px; padding: 2px 8px; border: 1px solid #ddd; border-radius: 3px; background: white; cursor: pointer; }
  .note-edit { display: flex; gap: 4px; }
  .note-edit input { font-size: 12px; padding: 2px 6px; border: 1px solid #ccc; border-radius: 3px; width: 200px; }
  .citation-picker { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
  .citation-picker button { font-size: 12px; padding: 3px 10px; border: 1px solid #ddd; border-radius: 3px; background: #f8f8f8; cursor: pointer; }
  .citation-picker button:hover { background: #e8f0fe; }
</style>
