import { describe, it, expect, vi } from "vitest";

const createClientMock = vi.fn(() => ({ auth: {} }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: (url: string, key: string, opts: any) => createClientMock(url, key, opts),
}));

import { createSupabaseClient } from "../../src/sync/supabase-client.js";

describe("createSupabaseClient", () => {
  it("omits storage when no adapter is given (PWA path)", () => {
    createSupabaseClient("https://x.supabase.co", "anon");
    const opts = createClientMock.mock.calls.at(-1)![2];
    expect(opts.auth.persistSession).toBe(true);
    expect("storage" in opts.auth).toBe(false);
  });

  it("forwards a custom storage adapter when given (extension path)", () => {
    const storage = { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} };
    createSupabaseClient("https://x.supabase.co", "anon", storage);
    const opts = createClientMock.mock.calls.at(-1)![2];
    expect(opts.auth.storage).toBe(storage);
  });
});
