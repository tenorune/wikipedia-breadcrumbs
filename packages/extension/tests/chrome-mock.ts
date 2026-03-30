import { vi } from "vitest";

const storage = new Map<string, unknown>();

export const chromeMock = {
  storage: {
    local: {
      get: vi.fn(async (keys: string | string[]) => {
        const keyList = typeof keys === "string" ? [keys] : keys;
        const result: Record<string, unknown> = {};
        for (const key of keyList) {
          if (storage.has(key)) result[key] = storage.get(key);
        }
        return result;
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(items)) {
          storage.set(key, value);
        }
      }),
    },
    onChanged: { addListener: vi.fn() },
  },
  runtime: { sendMessage: vi.fn() },
  tabs: { sendMessage: vi.fn(), query: vi.fn(), get: vi.fn() },
  alarms: { create: vi.fn(), clear: vi.fn(), onAlarm: { addListener: vi.fn() } },
  webNavigation: { onCompleted: { addListener: vi.fn() }, onCommitted: { addListener: vi.fn() } },
  offscreen: { createDocument: vi.fn(), hasDocument: vi.fn(async () => false), Reason: { WORKERS: "WORKERS" } },
};

export function installChromeMock() {
  (globalThis as any).chrome = chromeMock;
}

export function resetChromeMock() {
  storage.clear();
  vi.clearAllMocks();
}
