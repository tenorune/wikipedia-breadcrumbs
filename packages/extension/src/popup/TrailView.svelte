<script lang="ts">
  import type { Trail, Visit } from "@wikipedia-breadcrumbs/shared";

  interface Props {
    trail: Trail | null;
    visits: Visit[];
    onRename: (name: string) => void;
  }

  let { trail, visits, onRename }: Props = $props();

  let editing = $state(false);
  let editName = $state("");

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
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  const recentVisits = $derived(visits.slice(-5).reverse());
  const trailName = $derived(
    trail?.name ?? (visits.length > 0
      ? `${visits[0].title} → ${visits[visits.length - 1].title}`
      : "New trail")
  );

  async function openTrailDetail() {
    if (!trail) return;
    const historyUrl = chrome.runtime.getURL("src/history/index.html");
    const tabs = await chrome.tabs.query({ url: historyUrl + "*" });
    const targetUrl = `${historyUrl}?trail=${trail.id}`;
    if (tabs.length > 0 && tabs[0].id != null) {
      chrome.tabs.update(tabs[0].id, { active: true, url: targetUrl });
      chrome.windows.update(tabs[0].windowId!, { focused: true });
    } else {
      chrome.tabs.create({ url: targetUrl });
    }
  }
</script>

{#if trail}
  <div class="trail-view">
    <div class="header">
      {#if editing}
        <input bind:value={editName} onkeydown={(e) => e.key === "Enter" && saveEdit()} autofocus />
        <button onclick={saveEdit}>Save</button>
      {:else}
        <h2 onclick={startEdit}>{trailName}</h2>
      {/if}
      <span class="meta">{visits.length} pages &middot; started {timeAgo(trail.startedAt)}</span>
    </div>
    <ul class="visits">
      {#each recentVisits as visit}
        <li>
          <a href={visit.url} target="_blank">{visit.title}</a>
          <span class="time">{timeAgo(visit.timestamp)}</span>
        </li>
      {/each}
    </ul>
    <a class="see-all" href="#" onclick={(e) => { e.preventDefault(); openTrailDetail(); }}>
      {visits.length > 5 ? "See full trail" : "View trail details"}
    </a>
  </div>
{:else}
  <div class="empty">
    <p>No active trail on this tab.</p>
    <p>Browse Wikipedia to start capturing!</p>
  </div>
{/if}

<style>
  .trail-view { padding: 12px; }
  .header h2 { margin: 0 0 4px; font-size: 16px; cursor: pointer; }
  .header h2:hover { color: #0066cc; }
  .meta { font-size: 12px; color: #666; }
  .visits { list-style: none; padding: 0; margin: 12px 0 0; }
  .visits li { padding: 4px 0; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: center; }
  .visits a { color: #0066cc; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 240px; }
  .time { font-size: 11px; color: #999; flex-shrink: 0; }
  .see-all { display: block; text-align: center; padding: 8px; font-size: 13px; color: #0066cc; }
  .empty { padding: 24px 12px; text-align: center; color: #666; }
  input { font-size: 14px; padding: 2px 6px; border: 1px solid #0066cc; border-radius: 3px; width: 200px; }
</style>
