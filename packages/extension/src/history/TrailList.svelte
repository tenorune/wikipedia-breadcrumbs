<script lang="ts">
  import type { Trail, Visit } from "@wikipedia-breadcrumbs/shared";
  import { BreadcrumbsDB, trailStore, visitStore } from "@wikipedia-breadcrumbs/shared";
  import { getDeviceId } from "../shared/device-id.js";
  import { TrailList, type TrailSummary } from "@wikipedia-breadcrumbs/ui";

  interface Props {
    onSelectTrail: (trail: Trail) => void;
  }

  let { onSelectTrail }: Props = $props();

  const db = new BreadcrumbsDB();
  const trailOps = trailStore(db);
  const visitOps = visitStore(db);

  let summaries: TrailSummary[] = $state([]);
  let loading = $state(true);

  function displayNameFor(trail: Trail, visits: Visit[]): string {
    if (trail.name) return trail.name;
    if (visits.length === 0) return "Empty trail";
    if (visits.length === 1) return visits[0].title;
    return `${visits[0].title} → ${visits[visits.length - 1].title}`;
  }

  export async function refresh() {
    loading = true;
    const allTrails = await trailOps.getAll();
    const next: TrailSummary[] = [];
    for (const trail of allTrails) {
      const visits = await visitOps.getByTrailId(trail.id);
      const searchParts = [trail.name ?? "", trail.note ?? ""];
      for (const v of visits) {
        searchParts.push(v.title, v.note ?? "");
      }
      next.push({
        trail,
        displayName: displayNameFor(trail, visits),
        visitCount: visits.length,
        lastDiscovered: visits[visits.length - 1]?.timestamp ?? trail.startedAt,
        searchText: searchParts.join(" ").toLowerCase(),
      });
    }
    summaries = next;
    loading = false;
  }

  async function handleToggleStar(s: TrailSummary) {
    await trailOps.update(s.trail.id, { isStarred: !s.trail.isStarred });
    await refresh();
  }

  async function handleDeleteTrail(s: TrailSummary) {
    await trailOps.softDelete(s.trail.id);
    chrome.runtime.sendMessage({ type: "trailDeleted", trailId: s.trail.id });
    await refresh();
  }

  refresh();
</script>

{#if loading}
  <div class="delayed-spinner"></div>
{:else}
  <TrailList
    {db}
    {getDeviceId}
    {summaries}
    onSelectTrail={(s) => onSelectTrail(s.trail)}
    onToggleStar={handleToggleStar}
    onDeleteTrail={handleDeleteTrail}
    onImported={() => refresh()}
  />
{/if}
