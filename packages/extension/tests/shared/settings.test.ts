import { describe, it, expect, beforeEach } from "vitest";
import { resetChromeMock } from "../chrome-mock.js";
import { getSettings, updateSettings, DEFAULTS } from "../../src/shared/settings.js";

describe("settings", () => {
  beforeEach(() => { resetChromeMock(); });

  it("getSettings returns defaults when nothing stored", async () => {
    const settings = await getSettings();
    expect(settings).toEqual(DEFAULTS);
  });
  it("getSettings merges stored values with defaults", async () => {
    await chrome.storage.local.set({ idleTimeoutMinutes: 15 });
    const settings = await getSettings();
    expect(settings.idleTimeoutMinutes).toBe(15);
    expect(settings.captureEnabled).toBe(true);
  });
  it("updateSettings persists partial updates", async () => {
    await updateSettings({ captureEnabled: false });
    const settings = await getSettings();
    expect(settings.captureEnabled).toBe(false);
    expect(settings.idleTimeoutMinutes).toBe(30);
  });
  it("DEFAULTS has expected values", () => {
    expect(DEFAULTS.idleTimeoutMinutes).toBe(30);
    expect(DEFAULTS.captureEnabled).toBe(true);
  });
});
