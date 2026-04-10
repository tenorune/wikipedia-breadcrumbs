<script lang="ts">
  import type { Trail, Visit, LanguageBadgeSettings } from "@wikipedia-breadcrumbs/shared";
  import { BreadcrumbsDB, trailStore, visitStore, getLanguageBadgeSettings, shouldShowLanguageBadge } from "@wikipedia-breadcrumbs/shared";

  interface Props {
    trail: Trail | null;
    visits: Visit[];
    currentUrl: string;
    tabId: number;
    onRename: (name: string) => void;
  }

  let { trail, visits, currentUrl, tabId, onRename }: Props = $props();

  function navigateToVisit(url: string, e: MouseEvent) {
    e.preventDefault();
    if (trail) {
      chrome.runtime.sendMessage({ type: "navigateActiveTrail", trailId: trail.id, url });
    } else {
      chrome.tabs.update(tabId, { url });
    }
    window.close();
  }

  let editing = $state(false);
  let editName = $state("");

  // Stats
  let totalTrails = $state(0);
  let totalVisits = $state(0);
  let totalNotes = $state(0);
  let langSettings: LanguageBadgeSettings | null = $state(null);

  async function loadStats() {
    const db = new BreadcrumbsDB();
    const ts = trailStore(db);
    const trails = await ts.getAll();
    const allVisits = await db.visits.filter((v) => v.deletedAt === null).toArray();
    totalTrails = trails.length;
    totalVisits = allVisits.length;
    totalNotes = trails.filter((t) => t.note).length + allVisits.filter((v) => v.note).length;
    langSettings = await getLanguageBadgeSettings(db);
  }

  loadStats();

  function startEdit() {
    editName = trail?.name ?? "";
    editing = true;
  }

  function saveEdit() {
    if (editName.trim()) onRename(editName.trim());
    editing = false;
  }

  function timeAgo(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const remainHours = hours % 24;
    const remainMinutes = minutes % 60;

    if (days > 0) {
      const parts = [`${days} day${days === 1 ? "" : "s"}`];
      if (remainHours > 0) parts.push(`${remainHours} hour${remainHours === 1 ? "" : "s"}`);
      return parts.join(", ") + " ago";
    }
    if (hours > 0) {
      const parts = [`${hours} hour${hours === 1 ? "" : "s"}`];
      if (remainMinutes > 0) parts.push(`${remainMinutes} minute${remainMinutes === 1 ? "" : "s"}`);
      return parts.join(", ") + " ago";
    }
    if (minutes > 0) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    return "just now";
  }

  // Find current page index in visits
  const currentIndex = $derived.by(() => {
    if (!currentUrl) return -1;
    // Exact URL match
    let idx = visits.findIndex((v) => v.url === currentUrl);
    // Match by article path in URL
    if (idx === -1) {
      const path = currentUrl.split("/wiki/")[1]?.split(/[?#]/)[0];
      if (path) {
        idx = visits.findIndex((v) => v.articleId === path);
      }
    }
    // Match by title derived from URL (handles redirects)
    if (idx === -1) {
      const path = currentUrl.split("/wiki/")[1]?.split(/[?#]/)[0];
      if (path) {
        const decoded = decodeURIComponent(path).replace(/_/g, " ").toLowerCase();
        idx = visits.findIndex((v) => v.title.toLowerCase() === decoded);
      }
    }
    return idx;
  });

  // Find the current visit's ID for child detection
  const currentVisitId = $derived(currentIndex >= 0 ? visits[currentIndex]?.id ?? null : null);

  // Show all visits with relation markers, scroll to current
  let loadCount = $state(20);

  const visibleVisits = $derived.by(() => {
    const idx = currentIndex;
    const items = visits.slice(0, loadCount).map((v, i) => {
      let relation: "parent" | "current" | "child" | "other";
      if (i === idx) {
        relation = "current";
      } else if (idx >= 0 && i < idx) {
        relation = "parent";
      } else if (currentVisitId && v.parentVisitId === currentVisitId) {
        relation = "child";
      } else {
        relation = "other";
      }
      return { visit: v, relation };
    });
    return items;
  });

  function handleScroll(e: Event) {
    const el = e.target as HTMLElement;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 20) {
      if (loadCount < visits.length) {
        loadCount = Math.min(loadCount + 20, visits.length);
      }
    }
  }

  // Count children of the current visit
  const childCount = $derived.by(() => {
    if (!currentVisitId) return 0;
    return visits.filter((v) => v.parentVisitId === currentVisitId).length;
  });

  // Scroll to position current page based on child count:
  // 3 children → position 2 (1 parent above)
  // 4+ children → position 1 (0 parents above)
  // otherwise → center
  function scrollToCurrent(el: HTMLElement) {
    const idx = currentIndex;
    if (idx < 0) return;
    requestAnimationFrame(() => {
      const items = el.querySelectorAll("li");
      if (!items[idx]) return;

      const children = childCount;
      if (children >= 4) {
        // Position 1: scroll so current is at the top
        items[idx].scrollIntoView({ block: "start" });
      } else if (children >= 3) {
        // Position 2: one item above current visible
        const prev = items[Math.max(0, idx - 1)];
        if (prev) prev.scrollIntoView({ block: "start" });
      } else {
        // Center
        items[idx].scrollIntoView({ block: "center" });
      }
    });
  }

  const trailName = $derived(
    trail?.name ?? (visits.length > 1
      ? `${visits[0].title} → ${visits[visits.length - 1].title}`
      : visits.length === 1 ? visits[0].title : "New trail")
  );

  async function openTrailDetail() {
    if (!trail) return;
    const historyUrl = chrome.runtime.getURL("src/history/index.html");
    const tabs = await chrome.tabs.query({ url: historyUrl + "*" });
    const targetUrl = `${historyUrl}?trail=${trail.id}`;
    if (tabs.length > 0 && tabs[0].id != null) {
      chrome.tabs.update(tabs[0].id, { active: true, url: targetUrl });
      if (typeof chrome.windows !== "undefined") {
        chrome.windows.update(tabs[0].windowId!, { focused: true });
      }
    } else {
      chrome.tabs.create({ url: targetUrl });
    }
  }
</script>

<div class="stats">
  <div class="stat">
    <span class="stat-value">{totalTrails}</span>
    <span class="stat-label">Trails</span>
  </div>
  <div class="stat">
    <span class="stat-value">{totalVisits}</span>
    <span class="stat-label">Pages</span>
  </div>
  <div class="stat">
    <span class="stat-value">{totalNotes}</span>
    <span class="stat-label">Notes</span>
  </div>
</div>

{#if trail}
  <div class="trail-view">
    <div class="header">
      {#if editing}
        <!-- svelte-ignore a11y_autofocus -->
        <input bind:value={editName} onkeydown={(e) => e.key === "Enter" && saveEdit()} onblur={saveEdit} autofocus aria-label="Trail name" />
      {:else}
        <h2 role="button" tabindex="0" onclick={startEdit} onkeydown={(e) => e.key === "Enter" && startEdit()}>{trailName}</h2>
      {/if}
      <span class="meta">{visits.length} pages &middot; Started {timeAgo(trail.startedAt)}</span>
    </div>
    <ul class="visits" onscroll={handleScroll} use:scrollToCurrent>
      {#each visibleVisits as item}
        <li class={item.relation}>
          <span class="title-wrap">
            <a href={item.visit.url} onclick={(e) => navigateToVisit(item.visit.url, e)}>{item.visit.title}</a>
            {#if langSettings && shouldShowLanguageBadge(item.visit.language, langSettings)}
              <span class="lang-badge">{item.visit.language.toUpperCase()}</span>
            {/if}
          </span>
          <span class="time">{timeAgo(item.visit.timestamp)}</span>
        </li>
      {/each}
    </ul>
    <div class="see-all-wrap">
      <a class="see-all" href="#" onclick={(e) => { e.preventDefault(); openTrailDetail(); }}>
        See full trail →
      </a>
    </div>
  </div>
{:else}
  <div class="empty">
    <p>No active trail on this tab.</p>
    <p>Browse Wikipedia to start capturing!</p>
  </div>
{/if}

<style>
  .stats {
    display: flex;
    gap: 8px;
    padding: 12px 12px 0;
  }
  .stat {
    flex: 1;
    background: #f5f5f5;
    border-radius: 8px;
    padding: 10px 6px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  .stat-value { font-size: 16px; font-weight: 700; }
  .stat-label { font-size: 10px; color: #666; }

  .trail-view { padding: 12px; display: flex; flex-direction: column; flex: 1; overflow: hidden; }
  .header h2 { margin: 0 0 4px; font-size: 16px; cursor: pointer; }
  .header h2:hover { color: #0066cc; }
  .meta { font-size: 12px; color: #666; }
  .visits { list-style: none; padding: 0; margin: 12px 0 0; flex: 1; overflow-y: auto; min-height: 0; }
  .visits li { padding: 5px 0; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .visits a { color: #0066cc; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
  .visits li.parent { opacity: 0.65; }
  .visits li.current a { font-weight: 700; }
  .visits li.child { margin-left: 12px; border-left: 2px solid #0066cc; padding-left: 8px; }
  .visits li.other { opacity: 0.65; }
  .title-wrap { display: flex; align-items: center; gap: 4px; overflow: hidden; min-width: 0; }
  .title-wrap a { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lang-badge { background: #e8f0fe; color: #1a73e8; padding: 1px 5px; border-radius: 3px; font-size: 9px; font-weight: 600; letter-spacing: 0.5px; flex-shrink: 0; }
  .time { font-size: 11px; color: #999; flex-shrink: 0; }

  .see-all-wrap {
    position: sticky;
    bottom: 0;
    background: white;
    padding: 8px 0 0;
    text-align: center;
  }
  .see-all { font-size: 13px; color: #0066cc; text-decoration: none; }
  .see-all:hover { text-decoration: underline; }

  .empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: #666; font-size: 13px; padding: 12px; }
  .empty p { margin: 4px 0; }
  input { font-size: 14px; padding: 2px 6px; border: 1px solid #0066cc; border-radius: 3px; width: 100%; box-sizing: border-box; }
</style>
