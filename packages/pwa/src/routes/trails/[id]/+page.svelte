<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { TrailDetail } from "@wikipedia-breadcrumbs/ui";
  import { db } from "$lib/stores/db";
  import { syncState } from "$lib/stores/sync.svelte";
  import { runTitleWave, makeLetterColors } from "$lib/utils/title-wave";
  import { useLiveQuery } from "$lib/live-query.svelte";
  import { queryTrailDetail, type TrailDetailData } from "$lib/queries";
  import { markTrailViewed } from "$lib/stores/install.svelte";

  onMount(() => {
    markTrailViewed();
  });

  const detail = useLiveQuery(
    () => queryTrailDetail(db, $page.params.id),
    null as TrailDetailData | null,
    () => $page.params.id
  );
  const trail = $derived(detail.current?.trail ?? null);
  const visits = $derived(detail.current?.visits ?? []);
  const mergeCandidates = $derived(detail.current?.mergeCandidates ?? []);

  const trailDisplayName = $derived.by(() => {
    if (!trail) return "";
    if (trail.name) return trail.name;
    if (visits.length === 0) return "Empty trail";
    if (visits.length === 1) return visits[0].title;
    return `${visits[0].title} → ${visits[visits.length - 1].title}`;
  });

  let trailNameColors = $state<string[]>([]);
  $effect(() => {
    trailNameColors = makeLetterColors(trailDisplayName);
  });

  let _prevSyncing = false;
  $effect(() => {
    if (syncState.syncing && !_prevSyncing && trailNameColors.length > 0) {
      runTitleWave(trailNameColors, (c) => { trailNameColors = c; });
    }
    _prevSyncing = syncState.syncing;
  });
</script>

{#snippet header(name: string)}
  <span aria-hidden="true">{#each name.split("") as letter, i}<span style="color: {trailNameColors[i] ?? '#000000'}">{letter}</span>{/each}</span><span class="sr-only">{name}</span>
{/snippet}

{#if !trail}
  <div class="delayed-spinner"></div>
{:else}
  <TrailDetail {db} {trail} {visits} {mergeCandidates} {header} />
{/if}

<style>
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
</style>
