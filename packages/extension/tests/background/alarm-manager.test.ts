import { describe, it, expect, beforeEach } from "vitest";
import { resetChromeMock, chromeMock } from "../chrome-mock.js";
import { resetIdleAlarm, clearIdleAlarm, ALARM_PREFIX, parseTabIdFromAlarm } from "../../src/background/alarm-manager.js";

describe("alarm-manager", () => {
  beforeEach(() => { resetChromeMock(); });

  it("resetIdleAlarm clears and creates alarm for tab", async () => {
    await resetIdleAlarm(42, 30);
    expect(chromeMock.alarms.clear).toHaveBeenCalledWith(`${ALARM_PREFIX}42`);
    expect(chromeMock.alarms.create).toHaveBeenCalledWith(`${ALARM_PREFIX}42`, { delayInMinutes: 30 });
  });
  it("clearIdleAlarm clears alarm for tab", async () => {
    await clearIdleAlarm(42);
    expect(chromeMock.alarms.clear).toHaveBeenCalledWith(`${ALARM_PREFIX}42`);
  });
  it("ALARM_PREFIX is correct", () => {
    expect(ALARM_PREFIX).toBe("idle-tab-");
  });
  it("parseTabIdFromAlarm extracts tab ID", () => {
    expect(parseTabIdFromAlarm("idle-tab-42")).toBe(42);
  });
  it("parseTabIdFromAlarm returns null for non-matching", () => {
    expect(parseTabIdFromAlarm("other-alarm")).toBeNull();
  });
});
