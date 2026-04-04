<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import TrailDetail from "$lib/components/TrailDetail.svelte";
  import { markTrailViewed } from "$lib/stores/install.svelte";

  onMount(() => {
    markTrailViewed();
  });
</script>

<TrailDetail trailId={$page.params.id} onBack={() => goto("/trails")} />
