import { liveQuery } from "dexie";

/**
 * Bridges a Dexie liveQuery to Svelte 5 state. liveQuery re-runs the querier
 * whenever any Dexie table it read from changes (same tab or another tab).
 * `deps` exists because the querier runs outside effect tracking: pass any
 * reactive values the querier closes over (e.g. a route param) so the
 * subscription is torn down and recreated when they change.
 * On querier error, the last good value is kept and the error logged.
 */
export function useLiveQuery<T>(
  querier: () => T | Promise<T>,
  initial: T,
  deps?: () => unknown
) {
  let value = $state(initial);
  $effect(() => {
    deps?.();
    const sub = liveQuery(querier).subscribe({
      next: (v) => { value = v; },
      error: (err) => console.error("[pwa] liveQuery error:", err),
    });
    return () => sub.unsubscribe();
  });
  return {
    get current() { return value; },
  };
}
