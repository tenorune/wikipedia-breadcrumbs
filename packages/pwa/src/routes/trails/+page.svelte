<script lang="ts">
  import TrailList from "$lib/components/TrailList.svelte";
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
</script>

<h1 aria-label="Trails"><span aria-hidden="true">{#each titleLetters as letter, i}<span style="color: {letterColors[i]}">{letter}</span>{/each}</span></h1>
<TrailList />

<style>
  h1 { font-size: 22px; font-weight: 700; margin: 0 0 20px; }
</style>
