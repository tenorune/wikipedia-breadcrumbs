import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { initServiceWorker } from "../src/lib/sw-registration";

type Listener = (...args: unknown[]) => void;

function makeEnv({ hasController }: { hasController: boolean }) {
  const swListeners = new Map<string, Listener[]>();
  const docListeners = new Map<string, Listener[]>();
  const registration = { update: vi.fn().mockResolvedValue(undefined) };
  const serviceWorker = {
    controller: hasController ? {} : null,
    addEventListener: (type: string, fn: Listener) => {
      swListeners.set(type, [...(swListeners.get(type) ?? []), fn]);
    },
    register: vi.fn().mockResolvedValue(registration),
  };
  const reload = vi.fn();
  vi.stubGlobal("navigator", { serviceWorker });
  vi.stubGlobal("window", { location: { reload } });
  vi.stubGlobal("document", {
    visibilityState: "visible",
    addEventListener: (type: string, fn: Listener) => {
      docListeners.set(type, [...(docListeners.get(type) ?? []), fn]);
    },
  });
  const fire = (map: Map<string, Listener[]>, type: string) =>
    (map.get(type) ?? []).forEach((fn) => fn());
  return { serviceWorker, registration, reload, swListeners, docListeners, fire };
}

describe("initServiceWorker", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it("no-ops when serviceWorker is unsupported", () => {
    vi.stubGlobal("navigator", {});
    expect(() => initServiceWorker()).not.toThrow();
  });

  it("registers /service-worker.js and calls update() immediately", async () => {
    const env = makeEnv({ hasController: false });
    initServiceWorker();
    expect(env.serviceWorker.register).toHaveBeenCalledWith("/service-worker.js");
    await Promise.resolve(); // let register().then() run
    expect(env.registration.update).toHaveBeenCalledTimes(1);
  });

  it("calls update() again when the document becomes visible", async () => {
    const env = makeEnv({ hasController: false });
    initServiceWorker();
    await Promise.resolve();
    env.fire(env.docListeners, "visibilitychange");
    expect(env.registration.update).toHaveBeenCalledTimes(2);
  });

  it("does not reload on first install (no prior controller)", () => {
    const env = makeEnv({ hasController: false });
    initServiceWorker();
    env.fire(env.swListeners, "controllerchange");
    expect(env.reload).not.toHaveBeenCalled();
  });

  it("reloads exactly once on controllerchange when a controller existed", () => {
    const env = makeEnv({ hasController: true });
    initServiceWorker();
    env.fire(env.swListeners, "controllerchange");
    env.fire(env.swListeners, "controllerchange");
    expect(env.reload).toHaveBeenCalledTimes(1);
  });
});
