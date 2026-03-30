import { describe, it, expect, beforeEach } from "vitest";
import { resetChromeMock } from "../chrome-mock.js";
import { getDeviceId } from "../../src/shared/device-id.js";

describe("getDeviceId", () => {
  beforeEach(() => { resetChromeMock(); });

  it("generates and persists a new UUID on first call", async () => {
    const id = await getDeviceId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ deviceId: id });
  });
  it("returns stored ID on subsequent calls", async () => {
    await chrome.storage.local.set({ deviceId: "existing-id" });
    const id = await getDeviceId();
    expect(id).toBe("existing-id");
  });
});
