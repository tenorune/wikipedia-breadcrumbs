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
  let cardMenuOpen = $state(false);

  function stampDismiss() { (window as any).__dismissTime = Date.now(); }

  $effect(() => {
    if (!cardMenuOpen) return;
    const stamp = () => { stampDismiss(); };
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".card-menu-wrap")) cardMenuOpen = false;
    };
    setTimeout(() => {
      document.addEventListener("mousedown", stamp, true);
      document.addEventListener("click", close);
    });
    return () => {
      document.removeEventListener("mousedown", stamp, true);
      document.removeEventListener("click", close);
    };
  });

  // Sync noteValue with visit prop, but not while editing
  $effect(() => {
    if (!editingNote) noteValue = visit.note ?? "";
  });
  let showCite = $state(false);
  let citeCopied = $state(false);

  $effect(() => {
    if (!showCite) return;
    const stamp = () => { stampDismiss(); };
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".cite-wrap")) showCite = false;
    };
    setTimeout(() => {
      document.addEventListener("mousedown", stamp, true);
      document.addEventListener("click", close);
    });
    return () => {
      document.removeEventListener("mousedown", stamp, true);
      document.removeEventListener("click", close);
    };
  });

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

  function autoResize(e: Event) {
    const el = e.target as HTMLTextAreaElement;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }

  let noteDisplayHeight = 0;

  function captureNoteHeight(el: HTMLElement) {
    noteDisplayHeight = el.offsetHeight;
  }

  function autoResizeOnMount(el: HTMLTextAreaElement) {
    if (noteDisplayHeight > 0) {
      el.style.height = noteDisplayHeight + "px";
    } else {
      requestAnimationFrame(() => {
        el.style.height = "auto";
        el.style.height = el.scrollHeight + "px";
      });
    }
  }

  function saveNote() {
    const trimmed = noteValue.trim() || null;
    onUpdateNote(visit.id, trimmed);
    editingNote = false;
    stampDismiss();
  }

  function autoSaveNote() {
    onUpdateNote(visit.id, noteValue || null);
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
  <div class="card-menu-wrap">
    <button class="card-menu-btn" onclick={() => { cardMenuOpen = !cardMenuOpen; }} title="Actions">⋮</button>
    {#if cardMenuOpen}
      <div class="card-menu">
        {#if onSplit}
          <button onclick={() => { cardMenuOpen = false; onSplit!(visit.position); }}>Split</button>
        {/if}
        <button class="danger" onclick={() => { cardMenuOpen = false; onDelete(visit.id); }}>Delete</button>
      </div>
    {/if}
  </div>
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

  {#if visit.note || editingNote}
    <div class="note-area">
      {#if editingNote}
        <!-- svelte-ignore a11y_autofocus -->
        <textarea
          rows="1"
          bind:value={noteValue}
          placeholder="Add a note…"
          onblur={saveNote}
          oninput={(e) => { autoSaveNote(); autoResize(e); }}
          autofocus
          use:autoResizeOnMount
        ></textarea>
      {:else}
        <div class="note" role="button" tabindex="0"
          use:captureNoteHeight
          onclick={() => { editingNote = true; noteValue = visit.note ?? ""; }}
          onkeydown={(e) => e.key === "Enter" && (editingNote = true)}
          title="Click to edit"
        >
          {visit.note}
        </div>
      {/if}
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
  .card-menu-wrap { position: absolute; top: 8px; right: 8px; }
  .card-menu-btn { background: none; border: none; color: #999; cursor: pointer; font-size: 16px; padding: 0 4px; line-height: 1; }
  .card-menu-btn:hover { color: #333; }
  .card-menu {
    position: absolute; top: calc(100% + 4px); right: 0; background: white;
    border: 1px solid #ddd; border-radius: 8px; padding: 4px 0; z-index: 50;
    min-width: 100px; box-shadow: 0 4px 12px rgba(0,0,0,0.12);
  }
  .card-menu button { display: block; width: 100%; text-align: left; padding: 8px 14px; border: none; background: none; cursor: pointer; font-size: 13px; color: #222; }
  .card-menu button:hover { background: #f5f5f5; }
  .card-menu button.danger { color: #cc3300; }
  .card-menu button.danger:hover { background: #fff0ec; }

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
    border: 1px solid transparent;
    border-radius: 6px;
    padding: 5px 8px;
    cursor: pointer;
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.4;
    box-sizing: border-box;
  }
  .note:hover { background: #fff9c4; }

  .note-area textarea {
    width: 100%;
    box-sizing: border-box;
    padding: 5px 8px;
    border: 1px solid transparent;
    border-radius: 6px;
    font-size: 16px;
    font-family: inherit;
    resize: vertical;
    line-height: 1.4;
    outline: none;
    margin: 0;
    background: #fffde7;
    display: block;
    -webkit-text-size-adjust: 100%;
  }
  .actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
  }
  .actions-left { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }

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
