<script lang="ts">
  import { onMount } from "svelte";
  import type { Trail, Visit } from "@wikipedia-breadcrumbs/shared";
  import { BreadcrumbsDB, visitStore, trailStore } from "@wikipedia-breadcrumbs/shared";
  import { TrailDetail, type TrailChangeKind } from "@wikipedia-breadcrumbs/ui";

  interface Props {
    trail: Trail;
    onBack: () => void;
    onMutated: () => void;
  }

  let { trail: initialTrail, onBack, onMutated }: Props = $props();

  const db = new BreadcrumbsDB();
  const visitOps = visitStore(db);
  const trailOps = trailStore(db);

  let trail = $state(initialTrail);
  let visits: Visit[] = $state([]);
  let mergeCandidates: { id: string; displayName: string }[] = $state([]);

  async function reload() {
    const fresh = await trailOps.getById(trail.id);
    if (fresh) trail = fresh;
    visits = await visitOps.getByTrailId(trail.id);

    const others = (await trailOps.getAll()).filter((t) => t.id !== trail.id);
    const candidates: { id: string; displayName: string }[] = [];
    for (const t of others) {
      if (t.name) {
        candidates.push({ id: t.id, displayName: t.name });
      } else {
        const v = await visitOps.getByTrailId(t.id);
        const first = v[0]?.title ?? "";
        const last = v[v.length - 1]?.title ?? "";
        candidates.push({ id: t.id, displayName: first ? `${first} → ${last}` : "Empty trail" });
      }
    }
    mergeCandidates = candidates;
  }

  // Refresh when tab becomes visible
  onMount(() => {
    const onVisible = () => { if (document.visibilityState === "visible") reload(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  });

  function handleChanged(kind: TrailChangeKind) {
    if (kind === "name") {
      chrome.runtime.sendMessage({ type: "trailMutated", trailId: trail.id });
    }
    reload();
  }

  async function handleSplitDone(originalId: string, newTrailId: string) {
    const isActive = trail.status === "active";

    if (isActive) {
      // Navigate the old trail's tab to its new last page
      const oldVisits = await visitOps.getByTrailId(originalId);
      const oldLastVisit = oldVisits[oldVisits.length - 1];
      if (oldLastVisit) {
        await chrome.runtime.sendMessage({
          type: "navigateActiveTrail",
          trailId: originalId,
          url: oldLastVisit.url,
        });
      }
    }
    chrome.runtime.sendMessage({ type: "trailMutated", trailId: originalId });

    // Open the new trail's last page in a new tab
    const newVisits = await visitOps.getByTrailId(newTrailId);
    const newLastVisit = newVisits[newVisits.length - 1];
    if (newLastVisit) {
      await chrome.runtime.sendMessage({
        type: "resumeTrailInNewTab",
        trailId: newTrailId,
        url: newLastVisit.url,
      });
    }

    onMutated();
  }

  function handleMergeDone(mergedTrailId: string) {
    chrome.runtime.sendMessage({ type: "trailMutated", trailId: trail.id });
    chrome.runtime.sendMessage({ type: "trailDeleted", trailId: mergedTrailId });
    onMutated();
  }

  async function handleNavigate(visit: Visit, e: MouseEvent) {
    e.preventDefault();
    if (trail.status === "active") {
      // Let the background handle navigation — it knows the real tab ID
      await chrome.runtime.sendMessage({
        type: "navigateActiveTrail",
        trailId: trail.id,
        url: visit.url,
      });
    } else {
      // Finalized trail — background creates tab and resumes trail atomically
      await chrome.runtime.sendMessage({
        type: "resumeTrailInNewTab",
        trailId: trail.id,
        url: visit.url,
      });
      onMutated();
    }
  }

  reload();
</script>

<div class="trail-detail">
  <button class="back" onclick={onBack}>&larr; Back to trails</button>

  <TrailDetail
    {db}
    {trail}
    {visits}
    {mergeCandidates}
    onNavigate={handleNavigate}
    onChanged={handleChanged}
    onSplitDone={handleSplitDone}
    onMergeDone={handleMergeDone}
  />
</div>

<style>
  .back { background: none; border: none; color: #0066cc; cursor: pointer; padding: 0; margin-bottom: 16px; }
</style>
