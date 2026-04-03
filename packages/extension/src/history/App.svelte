<script lang="ts">
  import type { Trail } from "@wikipedia-breadcrumbs/shared";
  import { BreadcrumbsDB, trailStore } from "@wikipedia-breadcrumbs/shared";
  import TrailList from "./TrailList.svelte";
  import TrailDetail from "./TrailDetail.svelte";

  let selectedTrail: Trail | null = $state(null);
  let trailListRef: TrailList;

  function selectTrail(trail: Trail) {
    selectedTrail = trail;
    const url = new URL(window.location.href);
    url.searchParams.set("trail", trail.id);
    history.pushState(null, "", url.toString());
  }

  function backToList() {
    selectedTrail = null;
    const url = new URL(window.location.href);
    url.searchParams.delete("trail");
    history.pushState(null, "", url.toString());
    trailListRef?.refresh();
  }

  // Handle browser back/forward
  window.addEventListener("popstate", () => {
    const id = new URLSearchParams(window.location.search).get("trail");
    if (id) {
      const db = new BreadcrumbsDB();
      trailStore(db).getById(id).then((trail) => {
        selectedTrail = trail ?? null;
      });
    } else {
      selectedTrail = null;
      trailListRef?.refresh();
    }
  });

  // Refresh data when the tab becomes visible (user switches back to it)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      if (selectedTrail?.id) {
        const db = new BreadcrumbsDB();
        trailStore(db).getById(selectedTrail.id).then((trail) => {
          if (trail) selectedTrail = trail;
        });
      } else {
        trailListRef?.refresh();
      }
    }
  });

  // Check URL params for direct trail link from popup
  const params = new URLSearchParams(window.location.search);
  const directTrailId = params.get("trail");
  if (directTrailId) {
    const db = new BreadcrumbsDB();
    trailStore(db).getById(directTrailId).then((trail) => {
      if (trail) selectedTrail = trail;
    });
  }
</script>

<main>
  <div class="header-row">
    <h1>Wikipedia Breadcrumbs</h1>
    <button class="settings-btn" onclick={() => { window.location.href = chrome.runtime.getURL("src/options/index.html"); }} title="Settings"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 17H5"/><path d="M19 7h-9"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/></svg></button>
  </div>
  {#if selectedTrail}
    <TrailDetail trail={selectedTrail} onBack={backToList} onMutated={backToList} />
  {:else}
    <TrailList bind:this={trailListRef} onSelectTrail={selectTrail} />
  {/if}
</main>

<style>
  main { max-width: 700px; margin: 0 auto; }
  .header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
  h1 { margin: 0; font-size: 24px; }
  .settings-btn { background: none; border: none; font-size: 20px; cursor: pointer; padding: 4px; }
  .settings-btn:hover { opacity: 0.7; }
</style>
