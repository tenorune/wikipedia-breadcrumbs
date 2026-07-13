<script lang="ts">
  import { parseImportJson, detectConflicts, executeImport, pickFile } from "@wikipedia-breadcrumbs/shared";
  import type { BreadcrumbsDB, ConflictItem, ImportPlan } from "@wikipedia-breadcrumbs/shared";

  interface Props {
    db: BreadcrumbsDB;
    getDeviceId: () => Promise<string>;
    onComplete?: () => void;
  }
  let { db, getDeviceId, onComplete }: Props = $props();

  let conflicts = $state<ConflictItem[]>([]);
  let cleanTrails = $state<any[]>([]);
  let decisions = $state<Record<string, "skip" | "overwrite" | "copy">>({});
  let result = $state<{ trailsImported: number; visitsImported: number; skipped: number; errors: string[] } | null>(null);
  let error = $state("");
  let showDialog = $state(false);

  export async function start(): Promise<void> {
    error = "";
    result = null;
    const content = await pickFile(".json");
    if (!content) return;

    const parsed = parseImportJson(content);
    if (parsed.errors.length > 0) {
      error = parsed.errors.join("\n");
      return;
    }

    const detected = await detectConflicts(db, parsed.trails);
    cleanTrails = detected.clean;

    if (detected.conflicts.length > 0) {
      conflicts = detected.conflicts;
      decisions = {};
      for (const c of detected.conflicts) {
        decisions[c.imported.id] = "skip";
      }
      showDialog = true;
    } else {
      await doImport(detected.clean, []);
    }
  }

  async function confirmImport() {
    showDialog = false;
    const resolved = conflicts.map((c) => ({
      trail: c.imported,
      action: decisions[c.imported.id],
    }));
    await doImport(cleanTrails, resolved);
  }

  async function doImport(clean: any[], resolved: any[]) {
    const plan: ImportPlan = {
      items: [
        ...clean.map((t: any) => ({ trail: t, action: "overwrite" as const })),
        ...resolved,
      ],
    };
    const deviceId = await getDeviceId();
    result = await executeImport(db, plan, { userId: null, deviceId });
    onComplete?.();
  }
</script>

{#if error}
  <div class="import-error">{error}</div>
{/if}
{#if result}
  <div class="import-result">
    Imported {result.trailsImported} trail{result.trailsImported === 1 ? "" : "s"}
    ({result.visitsImported} visit{result.visitsImported === 1 ? "" : "s"}).
    {#if result.skipped > 0}Skipped {result.skipped}.{/if}
    {#if result.errors.length > 0}
      <div class="import-errors">{result.errors.join("; ")}</div>
    {/if}
  </div>
{/if}

{#if showDialog}
  <div class="conflict-overlay">
    <div class="conflict-dialog">
      <h3>Import Conflicts</h3>
      <p>{conflicts.length} trail{conflicts.length === 1 ? "" : "s"} already exist{conflicts.length === 1 ? "s" : ""} locally.</p>
      {#each conflicts as conflict}
        <div class="conflict-item">
          <strong>{conflict.imported.name ?? (conflict.imported.visits.length > 0 ? `${conflict.imported.visits[0].title} → ${conflict.imported.visits[conflict.imported.visits.length - 1].title}` : "Empty trail")}</strong>
          <span>({conflict.imported.visits.length} visits)</span>
          <div class="conflict-actions">
            <label><input type="radio" bind:group={decisions[conflict.imported.id]} value="skip" /> Skip</label>
            <label><input type="radio" bind:group={decisions[conflict.imported.id]} value="overwrite" /> Overwrite</label>
            <label><input type="radio" bind:group={decisions[conflict.imported.id]} value="copy" /> Import as copy</label>
          </div>
        </div>
      {/each}
      <div class="dialog-actions">
        <button class="confirm" onclick={confirmImport}>Import</button>
        <button onclick={() => { showDialog = false; }}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .import-error { color: #dc3545; font-size: 12px; margin-bottom: 10px; white-space: pre-wrap; }
  .import-result { font-size: 12px; color: #155724; background: #d4edda; padding: 6px 10px; border-radius: 6px; margin-bottom: 10px; }
  .import-errors { color: #dc3545; margin-top: 4px; }
  .conflict-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .conflict-dialog { background: white; border-radius: 12px; padding: 20px; max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto; }
  .conflict-dialog h3 { margin: 0 0 8px; }
  .conflict-dialog p { font-size: 13px; color: #666; margin: 0 0 12px; }
  .conflict-item { margin: 12px 0; padding: 10px; border: 1px solid #e8e8e8; border-radius: 8px; }
  .conflict-actions { display: flex; gap: 12px; margin-top: 6px; font-size: 13px; }
  .conflict-actions label { display: flex; align-items: center; gap: 4px; cursor: pointer; }
  .dialog-actions { display: flex; gap: 8px; margin-top: 16px; }
  .dialog-actions button { padding: 6px 16px; border: 1px solid #ddd; border-radius: 6px; cursor: pointer; background: white; }
  .dialog-actions .confirm { background: #0066cc; color: white; border: none; }
</style>
