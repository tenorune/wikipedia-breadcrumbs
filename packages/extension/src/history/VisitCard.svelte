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

  // Close this cite menu when another one opens
  $effect(() => {
    const onOtherOpen = () => { showCitation = false; cardMenuOpen = false; };
    document.addEventListener("closeAllMenus", onOtherOpen);
    return () => document.removeEventListener("closeAllMenus", onOtherOpen);
  });

  $effect(() => {
    if (!showCitation) return;
    const stamp = () => { stampDismiss(); };
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".cite-wrap")) showCitation = false;
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

  let editingNote = $state(false);
  let noteText = $state(visit.note ?? "");
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

  function positionCiteMenu(el: HTMLElement) {
    const rect = el.parentElement!.getBoundingClientRect();
    if (rect.top < window.innerHeight / 2) {
      el.style.bottom = "auto";
      el.style.top = "calc(100% + 4px)";
    }
  }

  function saveNote() {
    onUpdateNote(visit.id, noteText);
    editingNote = false;
    stampDismiss();
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
  <div class="card-body">
    <div class="card-menu-wrap">
      <button class="card-menu-btn" onclick={() => { document.dispatchEvent(new Event("closeAllMenus")); cardMenuOpen = !cardMenuOpen; }} title="Actions">⋮</button>
      {#if cardMenuOpen}
        <div class="card-menu">
          {#if onSplit}
            <button onclick={() => { cardMenuOpen = false; onSplit!(visit.position); }}>Split</button>
          {/if}
          <button class="danger" onclick={() => { cardMenuOpen = false; onDelete(visit.id); }}>Delete</button>
        </div>
      {/if}
    </div>
    <div class="main">
      <a href={visit.url} onclick={handleTitleClick} class="title">{visit.title}</a>
      {#if visit.sourceDetail}
        <span class="redirect">({visit.sourceDetail})</span>
      {/if}
      <div class="meta">
        <span class="time">{formatTime(visit.timestamp)}</span>
        {#if visit.lastVisitedAt && visit.lastVisitedAt !== visit.timestamp}
          <span class="sep">&middot;</span>
          <span class="time">Last visited {formatTime(visit.lastVisitedAt)}</span>
        {/if}
      </div>
    </div>
    {#if visit.note || editingNote}
      <div class="note-area">
        {#if editingNote}
          <!-- svelte-ignore a11y_autofocus -->
          <textarea bind:value={noteText} placeholder="Add a note..." rows="1" onblur={saveNote} oninput={(e) => { autoSaveNote(); autoResize(e); }} autofocus
            use:autoResizeOnMount></textarea>
        {:else}
          <div class="note-display" use:captureNoteHeight onclick={() => { if ((window as any).__dismissTime && Date.now() - (window as any).__dismissTime < 300) return; noteText = visit.note ?? ""; editingNote = true; }}>{visit.note}</div>
        {/if}
      </div>
    {/if}
    <div class="actions">
      {#if !editingNote && !visit.note}
        <button class="note-btn" onclick={() => { editingNote = true; }}>Add Note</button>
      {/if}
      <div class="cite-wrap">
        <button class="cite-btn" onclick={() => { document.dispatchEvent(new Event("closeAllMenus")); showCitation = !showCitation; }}>Cite</button>
        {#if showCitation}
          <div class="cite-menu" use:positionCiteMenu>
            {#each citationFormats as fmt}
              <button class="cite-item" onclick={() => copyCitation(fmt.key)}>{fmt.label}</button>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
  <div class="split-divider">
    <hr />
  </div>
</div>

<style>
  .visit-card { padding: 0; }
  .card-body { padding: 8px 0 8px 8px; border-radius: 6px; position: relative; margin-top: 4px; }
  .card-menu-wrap { position: absolute; top: 8px; right: 8px; }
  .card-menu-btn { background: none; border: none; color: #999; cursor: pointer; font-size: 16px; padding: 0 4px; line-height: 1; }
  .card-menu-btn:hover { color: #333; }
  .card-menu {
    position: absolute; top: calc(100% + 4px); right: 0; background: white;
    border: 1px solid #ddd; border-radius: 6px; padding: 4px 0; z-index: 50;
    min-width: 100px; box-shadow: 0 4px 12px rgba(0,0,0,0.12);
  }
  .card-menu button { display: block; width: 100%; text-align: left; padding: 6px 12px; border: none; background: none; cursor: pointer; font-size: 12px; color: #222; }
  .card-menu button:hover { background: #f5f5f5; }
  .card-menu button.danger { color: #cc3300; }
  .card-menu button.danger:hover { background: #fff0ec; }
  .main { padding-right: 24px; }
  .title { color: #0066cc; text-decoration: none; font-size: 15px; font-weight: 500; }
  .title:hover { text-decoration: underline; }
  .redirect { font-size: 12px; color: #999; font-style: italic; }
  .meta { font-size: 12px; color: #666; margin-top: 4px; display: flex; gap: 4px; align-items: center; }
  .sep { color: #999; }
  .badge { background: #e8f0fe; color: #1a73e8; padding: 1px 6px; border-radius: 3px; font-size: 11px; }
  .detail { font-style: italic; }
  .actions { display: flex; gap: 8px; margin-top: 6px; }
  .note-display { font-size: 12px; color: #333; background: #fffde7; border: 1px solid transparent; border-radius: 6px; padding: 5px 8px; cursor: pointer; text-align: left; white-space: pre-wrap; word-break: break-word; line-height: 1.4; box-sizing: border-box; }
  .note-display:hover { background: #fff9c4; }
  .note-btn, .cite-btn { font-size: 12px; padding: 2px 8px; border: 1px solid #ddd; border-radius: 3px; background: white; cursor: pointer; }
  .split-divider { margin-top: 4px; }
  .split-divider hr { border: none; border-top: 1px solid #eee; margin: 0; }
  .note-area { margin-top: 6px; margin-right: 8px; }
  .note-area textarea { width: 100%; box-sizing: border-box; font-size: 12px; padding: 5px 8px; border: 1px solid transparent; box-shadow: none; border-radius: 6px; font-family: inherit; resize: vertical; line-height: 1.4; outline: none; margin: 0; background: #fffde7; -webkit-text-size-adjust: 100%; display: block; }
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
    font-size: 12px;
    color: #222;
  }
  .cite-item:hover { background: #f5f5f5; }
</style>
