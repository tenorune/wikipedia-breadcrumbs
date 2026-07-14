<script lang="ts">
  import { goto } from "$app/navigation";
  import { trailStore } from "@wikipedia-breadcrumbs/shared";
  import { TrailList, type TrailSummary } from "@wikipedia-breadcrumbs/ui";
  import { db } from "$lib/stores/db";
  import { getDeviceId } from "$lib/stores/device-id";
  import { useLiveQuery } from "$lib/live-query.svelte";
  import { queryTrailData, type TrailData } from "$lib/queries";
  import { syncState } from "$lib/stores/sync.svelte";
  import { runTitleWave, makeLetterColors } from "$lib/utils/title-wave";

  const titleText = "Trails";
  const titleLetters = titleText.split("");
  let letterColors = $state(makeLetterColors(titleText));

  let _prevSyncing = false;
  $effect(() => {
    if (syncState.syncing && !_prevSyncing) {
      runTitleWave(letterColors, (c) => { letterColors = c; });
    }
    _prevSyncing = syncState.syncing;
  });

  const ts = trailStore(db);

  const data = useLiveQuery(() => queryTrailData(db), null as TrailData | null);
  const loaded = $derived(data.current !== null);
  const summaries = $derived(data.current?.summaries ?? []);

  async function handleToggleStar(s: TrailSummary) {
    await ts.update(s.trail.id, { isStarred: !s.trail.isStarred });
  }

  async function handleDeleteTrail(s: TrailSummary) {
    await ts.softDelete(s.trail.id);
  }
</script>

<h1 aria-label="Trails"><span aria-hidden="true">{#each titleLetters as letter, i}<span style="color: {letterColors[i]}">{letter}</span>{/each}</span></h1>

{#if loaded}
  <div class="fade-in">
    <TrailList
      {db}
      getDeviceId={async () => getDeviceId()}
      {summaries}
      onSelectTrail={(s) => goto("/trails/" + s.trail.id)}
      onToggleStar={handleToggleStar}
      onDeleteTrail={handleDeleteTrail}
    />
  </div>
{/if}

<style>
  h1 { font-size: 22px; font-weight: 700; margin: 0 0 20px; }
  .fade-in { animation: fadeIn 0.1s ease-in; }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
</style>
