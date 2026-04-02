<script lang="ts">
  import { formatCitation, CitationFormat } from "@wikipedia-breadcrumbs/shared";
  import type { Visit } from "@wikipedia-breadcrumbs/shared";

  interface Props {
    visit: Visit;
    onUpdateNote: (id: string, note: string | null) => void;
    onDelete: (id: string) => void;
    onSplit?: (position: number) => void;
  }

  let { visit, onUpdateNote, onDelete, onSplit }: Props = $props();

  let editingNote = $state(false);
  let noteValue = $state("");

  // Sync noteValue with visit prop (initial + updates)
  $effect(() => {
    noteValue = visit.note ?? "";
  });
  let showCite = $state(false);
  let citeCopied = $state(false);

  const citationFormats: { label: string; value: CitationFormat }[] = [
    { label: "Wikipedia template", value: CitationFormat.Wikipedia },
    { label: "APA", value: CitationFormat.APA },
    { label: "MLA", value: CitationFormat.MLA },
    { label: "Chicago", value: CitationFormat.Chicago },
    { label: "BibTeX", value: CitationFormat.BibTeX },
    { label: "URL", value: CitationFormat.URL },
    { label: "Markdown", value: CitationFormat.Markdown },
  ];

  function formatTime(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const isThisYear = d.getFullYear() === now.getFullYear();
    const datePart = d.toLocaleDateString(undefined, {
      ...(isThisYear ? {} : { year: "numeric" }),
      month: "short", day: "numeric",
    });
    const timePart = d.toLocaleTimeString(undefined, {
      hour: "numeric", minute: "2-digit",
    });
    return `${datePart} at ${timePart}`;
  }

  function saveNote() {
    const trimmed = noteValue.trim() || null;
    onUpdateNote(visit.id, trimmed);
    editingNote = false;
  }

  function autoSaveNote() {
    onUpdateNote(visit.id, noteValue.trim() || null);
  }

  function cancelNote() {
    noteValue = visit.note ?? "";
    editingNote = false;
  }

  async function copyCitation(format: CitationFormat) {
    const text = formatCitation(
      { url: visit.url, title: visit.title, timestamp: visit.timestamp, language: visit.language, articleId: visit.articleId },
      format,
    );
    await navigator.clipboard.writeText(text);
    citeCopied = true;
    showCite = false;
    setTimeout(() => { citeCopied = false; }, 2000);
  }

  const sameTime = $derived(visit.timestamp === visit.lastVisitedAt);
</script>

<div class="card">
  <button class="delete-x" onclick={() => onDelete(visit.id)} title="Delete visit" aria-label="Delete visit">✕</button>
  <div class="header">
    <a class="title" href={visit.url} target="_blank" rel="noopener noreferrer">
      {visit.title}
    </a>
    {#if visit.sourceDetail}
      <span class="redirect">({visit.sourceDetail})</span>
    {/if}
  </div>

  <div class="times">
    <span>{formatTime(visit.timestamp)}</span>
    {#if !sameTime}
      <span>· Last visited {formatTime(visit.lastVisitedAt)}</span>
    {/if}
  </div>

  {#if visit.note && !editingNote}
    <div class="note" role="button" tabindex="0"
      onclick={() => { editingNote = true; noteValue = visit.note ?? ""; }}
      onkeydown={(e) => e.key === "Enter" && (editingNote = true)}
      title="Click to edit"
    >
      {visit.note}
    </div>
  {/if}

  {#if editingNote}
    <div class="note-edit">
      <!-- svelte-ignore a11y_autofocus -->
      <textarea
        rows="2"
        bind:value={noteValue}
        placeholder="Add a note…"
        onblur={saveNote}
        oninput={autoSaveNote}
        autofocus
      ></textarea>
    </div>
  {/if}

  <div class="actions">
    <div class="actions-left">
      {#if !visit.note && !editingNote}
        <button class="action" onclick={() => { editingNote = true; noteValue = ""; }}>Add Note</button>
      {/if}
      <div class="cite-wrap">
        <button class="action" onclick={() => { showCite = !showCite; }}>
          {citeCopied ? "Copied!" : "Cite"}
        </button>
        {#if showCite}
          <div class="cite-menu">
            {#each citationFormats as fmt}
              <button class="cite-item" onclick={() => copyCitation(fmt.value)}>{fmt.label}</button>
            {/each}
          </div>
        {/if}
      </div>
    </div>
    {#if onSplit}
      <div class="actions-right">
        <button class="action split" onclick={() => onSplit!(visit.position)}>Split</button>
      </div>
    {/if}
  </div>
</div>


<style>
  .card {
    border: 1px solid #e8e8e8;
    border-radius: 10px;
    padding: 12px 14px;
    background: #fff;
    display: flex;
    flex-direction: column;
    gap: 6px;
    position: relative;
  }
  .delete-x {
    position: absolute;
    top: 8px;
    right: 8px;
    background: none;
    border: none;
    color: #bbb;
    cursor: pointer;
    font-size: 14px;
    padding: 2px 4px;
    line-height: 1;
  }
  .delete-x:hover { color: #cc3300; }

  .header { }
  .title {
    font-weight: 600;
    color: #0066cc;
    text-decoration: none;
    font-size: 14px;
    word-break: break-word;
  }
  .title:hover { text-decoration: underline; }
  .redirect { font-size: 11px; color: #999; font-style: italic; }

  .times { font-size: 11px; color: #888; }

  .note {
    font-size: 13px;
    color: #333;
    background: #fffde7;
    border-radius: 6px;
    padding: 6px 8px;
    cursor: pointer;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .note:hover { background: #fff9c4; }

  .note-edit textarea {
    width: 100%;
    box-sizing: border-box;
    padding: 6px 8px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 13px;
    font-family: inherit;
    resize: vertical;
  }
  .actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
  }
  .actions-left { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .actions-right { }

  .action {
    font-size: 12px;
    padding: 4px 10px;
    border: 1px solid #ddd;
    border-radius: 6px;
    background: #f8f8f8;
    cursor: pointer;
    color: #333;
  }
  .action:hover { background: #eee; }
  .action.split { color: #6600cc; border-color: #d0c0f5; }
  .action.split:hover { background: #f5f0ff; }

  .cite-wrap { position: relative; }
  .cite-menu {
    position: absolute;
    bottom: calc(100% + 4px);
    left: 0;
    background: white;
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 4px 0;
    z-index: 50;
    min-width: 180px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.12);
  }
  .cite-item {
    display: block;
    width: 100%;
    text-align: left;
    padding: 7px 14px;
    border: none;
    background: none;
    cursor: pointer;
    font-size: 13px;
    color: #222;
  }
  .cite-item:hover { background: #f5f5f5; }

</style>
