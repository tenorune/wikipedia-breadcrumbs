<script lang="ts">
  import { exportTrailsJson, exportTrailsCsv, downloadFile, exportFilename } from "@wikipedia-breadcrumbs/shared";
  import { db } from "$lib/stores/db";

  interface Props {
    trailIds?: string[];
    trailName?: string | null;
  }

  let { trailIds, trailName }: Props = $props();
  let open = $state(false);

  async function handleExport(format: "json" | "csv") {
    open = false;
    const content = format === "json"
      ? await exportTrailsJson(db, trailIds)
      : await exportTrailsCsv(db, trailIds);
    const filename = trailIds?.length === 1
      ? exportFilename(trailName ?? null, format)
      : exportFilename(null, format);
    downloadFile(content, filename, format === "json" ? "application/json" : "text/csv");
  }
</script>

<div class="export-menu">
  <button class="export-btn" onclick={() => { open = !open; }}>Export</button>
  {#if open}
    <div class="export-dropdown">
      <button onclick={() => handleExport("json")}>JSON</button>
      <button onclick={() => handleExport("csv")}>CSV</button>
    </div>
  {/if}
</div>

<style>
  .export-menu { position: relative; display: inline-block; }
  .export-btn {
    font-size: 12px; padding: 4px 10px; border: 1px solid #ddd; border-radius: 6px;
    background: #f8f8f8; cursor: pointer; color: #333;
  }
  .export-btn:hover { background: #eee; }
  .export-dropdown {
    position: absolute; top: calc(100% + 4px); left: 0; background: white;
    border: 1px solid #ddd; border-radius: 8px; padding: 4px 0; z-index: 50;
    min-width: 80px; box-shadow: 0 4px 12px rgba(0,0,0,0.12);
  }
  .export-dropdown button {
    display: block; width: 100%; text-align: left; padding: 7px 14px;
    border: none; background: none; cursor: pointer; font-size: 13px;
  }
  .export-dropdown button:hover { background: #f5f5f5; }
</style>
