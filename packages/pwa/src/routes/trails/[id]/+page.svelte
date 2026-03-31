<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import TrailDetail from "$lib/components/TrailDetail.svelte";
</script>

<TrailDetail trailId={$page.params.id} onBack={() => goto("/trails")} />
