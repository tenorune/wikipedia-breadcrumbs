import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetChromeMock, chromeMock } from "../chrome-mock.js";
import { sendToOffscreen } from "../../src/background/offscreen.js";

describe("sendToOffscreen", () => {
  beforeEach(() => { resetChromeMock(); });

  it("creates offscreen document if not exists and sends message", async () => {
    chromeMock.offscreen.hasDocument.mockResolvedValue(false);
    chromeMock.offscreen.createDocument.mockResolvedValue(undefined);
    chromeMock.runtime.sendMessage.mockResolvedValue({ success: true, data: "ok" });
    const result = await sendToOffscreen({ type: "getTrailsAll" });
    expect(chromeMock.offscreen.createDocument).toHaveBeenCalled();
    expect(result).toEqual({ success: true, data: "ok" });
  });

  it("skips creation if document already exists", async () => {
    chromeMock.offscreen.hasDocument.mockResolvedValue(true);
    chromeMock.runtime.sendMessage.mockResolvedValue({ success: true, data: [] });
    await sendToOffscreen({ type: "getTrailsAll" });
    expect(chromeMock.offscreen.createDocument).not.toHaveBeenCalled();
  });

  it("retries on sendMessage failure", async () => {
    chromeMock.offscreen.hasDocument
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    chromeMock.offscreen.createDocument.mockResolvedValue(undefined);
    chromeMock.runtime.sendMessage
      .mockRejectedValueOnce(new Error("disconnected"))
      .mockResolvedValueOnce({ success: true, data: "ok" });
    const result = await sendToOffscreen({ type: "getTrailsAll" });
    expect(result).toEqual({ success: true, data: "ok" });
  });
});
