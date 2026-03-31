import { describe, it, expect, beforeEach } from "vitest";
import { LinkTracker } from "../../src/content/link-tracker.js";

describe("LinkTracker", () => {
  let tracker: LinkTracker;
  beforeEach(() => { tracker = new LinkTracker(); });

  it("records click on Wikipedia article link", () => {
    tracker.handleClick({ href: "https://en.wikipedia.org/wiki/Rust_(programming_language)", textContent: "Rust" });
    const context = tracker.consumeClickContext();
    expect(context.clickedLinkText).toBe("Rust");
    expect(context.referrerUrl).toBeNull();
  });

  it("consumeClickContext clears stored data", () => {
    tracker.handleClick({ href: "https://en.wikipedia.org/wiki/Rust_(programming_language)", textContent: "Rust" });
    tracker.consumeClickContext();
    const second = tracker.consumeClickContext();
    expect(second.clickedLinkText).toBeNull();
  });

  it("returns nulls when no click recorded", () => {
    const context = tracker.consumeClickContext();
    expect(context.clickedLinkText).toBeNull();
    expect(context.referrerUrl).toBeNull();
  });

  it("ignores non-Wikipedia links", () => {
    tracker.handleClick({ href: "https://google.com", textContent: "Google" });
    const context = tracker.consumeClickContext();
    expect(context.clickedLinkText).toBeNull();
  });

  it("setReferrer stores referrer URL", () => {
    tracker.setReferrer("https://google.com");
    tracker.handleClick({ href: "https://en.wikipedia.org/wiki/Test", textContent: "Test" });
    const context = tracker.consumeClickContext();
    expect(context.referrerUrl).toBe("https://google.com");
  });
});
