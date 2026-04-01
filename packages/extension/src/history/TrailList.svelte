<script lang="ts">
  import type { Trail } from "@wikipedia-breadcrumbs/shared";
  import { BreadcrumbsDB, trailStore, visitStore } from "@wikipedia-breadcrumbs/shared";

  interface TrailSummary {
    trail: Trail;
    visitCount: number;
    firstTitle: string;
    lastTitle: string;
    searchText: string;
  }

  interface Props {
    onSelectTrail: (trail: Trail) => void;
  }

  let { onSelectTrail }: Props = $props();

  let trails: TrailSummary[] = $state([]);
  let searchQuery = $state("");
  let sortBy: "recent" | "oldest" | "starred" = $state("recent");
  let loading = $state(true);

  const db = new BreadcrumbsDB();
  const trailOps = trailStore(db);
  const visitOps = visitStore(db);

  export async function refresh() {
    loading = true;
    const allTrails = await trailOps.getAll();
    const summaries: TrailSummary[] = [];
    for (const trail of allTrails) {
      const visits = await visitOps.getByTrailId(trail.id);
      const searchParts = [trail.name ?? "", trail.note ?? ""];
      for (const v of visits) {
        searchParts.push(v.title, v.note ?? "");
      }
      summaries.push({
        trail, visitCount: visits.length,
        firstTitle: visits[0]?.title ?? "",
        lastTitle: visits[visits.length - 1]?.title ?? "",
        searchText: searchParts.join(" ").toLowerCase(),
      });
    }
    trails = summaries;
    loading = false;
  }

  const filteredTrails = $derived.by(() => {
    let result = trails;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((s) => s.searchText.includes(q));
    }
    if (sortBy === "recent") {
      result = [...result].sort((a, b) => b.trail.updatedAt.localeCompare(a.trail.updatedAt));
    } else if (sortBy === "oldest") {
      result = [...result].sort((a, b) => a.trail.startedAt.localeCompare(b.trail.startedAt));
    } else if (sortBy === "starred") {
      result = [...result].sort((a, b) => (b.trail.isStarred ? 1 : 0) - (a.trail.isStarred ? 1 : 0));
    }
    return result;
  });

  async function toggleStar(trailId: string) {
    const summary = trails.find((s) => s.trail.id === trailId);
    if (!summary) return;
    summary.trail.isStarred = !summary.trail.isStarred;
    await trailOps.update(trailId, { isStarred: summary.trail.isStarred });
    trails = [...trails];
  }

  async function deleteTrail(trailId: string) {
    await trailOps.softDelete(trailId);
    chrome.runtime.sendMessage({ type: "trailDeleted", trailId });
    await refresh();
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  }

  refresh();
</script>

<div class="trail-list">
  <div class="toolbar">
    <input type="text" placeholder="Search trails..." bind:value={searchQuery} />
    <select bind:value={sortBy}>
      <option value="recent">Most Recent</option>
      <option value="oldest">Oldest First</option>
      <option value="starred">Starred First</option>
    </select>
  </div>

  {#if loading}
    <p class="loading">Loading trails...</p>
  {:else if filteredTrails.length === 0}
    <p class="empty">
      {searchQuery ? "No trails match your search." : "No trails yet. Browse Wikipedia to start!"}
    </p>
  {:else}
    <ul class="trails">
      {#each filteredTrails as summary}
        <li>
          <button class="star" onclick={() => toggleStar(summary.trail.id)}>
            {summary.trail.isStarred ? "★" : "☆"}
          </button>
          <div class="trail-info" onclick={() => onSelectTrail(summary.trail)}>
            <span class="name">{summary.trail.name ?? `${summary.firstTitle} → ${summary.lastTitle}`}</span>
            <span class="meta">
              {summary.visitCount} pages &middot; {formatDate(summary.trail.startedAt)}
              {#if summary.trail.status === "active"}
                <span class="active-badge">Active</span>
              {/if}
            </span>
          </div>
          <button class="delete" onclick={() => deleteTrail(summary.trail.id)}>Delete</button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .trail-list { width: 100%; }
  .toolbar { display: flex; gap: 8px; margin-bottom: 16px; }
  .toolbar input { flex: 1; padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; }
  .toolbar select { padding: 8px; border: 1px solid #ccc; border-radius: 4px; }
  .trails { list-style: none; padding: 0; }
  .trails li { display: flex; align-items: center; gap: 8px; padding: 10px 0; border-bottom: 1px solid #eee; }
  .star { background: none; border: none; font-size: 18px; cursor: pointer; padding: 0 4px; }
  .trail-info { flex: 1; cursor: pointer; }
  .trail-info:hover .name { color: #0066cc; }
  .name { font-weight: 500; display: block; }
  .meta { font-size: 12px; color: #666; }
  .active-badge { background: #d4edda; color: #155724; padding: 1px 6px; border-radius: 3px; font-size: 11px; margin-left: 4px; }
  .delete { background: none; border: 1px solid #ddd; border-radius: 3px; padding: 4px 8px; font-size: 12px; cursor: pointer; color: #999; }
  .delete:hover { border-color: #dc3545; color: #dc3545; }
  .loading, .empty { text-align: center; color: #666; padding: 24px; }
</style>
