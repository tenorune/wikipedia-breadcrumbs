# Wikimedia OAuth Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Wikimedia as an auth provider alongside Google and email/password in both the extension and PWA.

**Architecture:** Wikimedia OAuth 2.0 flows through Supabase's custom provider support. No Edge Functions needed — Supabase handles the token exchange. Client code calls `signInWithOAuth({ provider: 'custom:wikimedia' })`. The extension uses `chrome.identity.launchWebAuthFlow` for the redirect flow.

**Tech Stack:** Supabase Auth (custom OAuth provider), Wikimedia OAuth 2.0, Chrome Identity API

**Prerequisites:** Register a Wikimedia OAuth 2.0 consumer at https://api.wikimedia.org and configure it in the Supabase Dashboard.

---

## Setup (manual, before code changes)

### Step 1: Register Wikimedia OAuth Consumer

1. Go to https://api.wikimedia.org and log in with your Wikimedia account
2. Go to the API keys dashboard, click **Create key**
3. Choose **server-side app**
4. Application name: `Wikipedia Breadcrumbs`
5. Callback URL: `https://<your-supabase-project-ref>.supabase.co/auth/v1/callback`
6. Save the **Client ID** and **Client Secret**

Repeat for dev Supabase project if using a separate one.

### Step 2: Configure Supabase Custom Provider

1. Go to Supabase Dashboard > **Auth > Providers**
2. Click **Add new provider** (or equivalent)
3. Choose **Manual configuration**
4. Identifier: `wikimedia`
5. Authorization URL: `https://meta.wikimedia.org/w/rest.php/oauth2/authorize`
6. Token URL: `https://meta.wikimedia.org/w/rest.php/oauth2/access_token`
7. UserInfo URL: `https://meta.wikimedia.org/w/rest.php/oauth2/resource/profile`
8. Client ID: (from step 1)
9. Client Secret: (from step 1)
10. Scopes: leave empty or set to `basic`
11. Enable the provider

### Step 3: Add env vars

Add to `.env` files:
```
# Not strictly needed in code — Supabase handles the OAuth flow server-side.
# But document the consumer ID for reference:
# WIKIMEDIA_CLIENT_ID=<your-client-id>
```

No client-side env vars needed — the Supabase client handles the redirect.

---

## File Structure

### Modified files

| File | Change |
|------|--------|
| `packages/pwa/src/lib/stores/auth.svelte.ts` | Add `signInWithWikimedia()` |
| `packages/pwa/src/routes/settings/+page.svelte` | Add "Sign in with Wikipedia" button |
| `packages/extension/src/options/SettingsForm.svelte` | Add "Sign in with Wikipedia" button |
| `packages/extension/src/offscreen/auth-handler.ts` | Add Wikimedia OAuth flow via `launchWebAuthFlow` |
| `packages/extension/src/shared/messaging.ts` | Add `signInWithWikimedia` message type |
| `packages/extension/src/background/index.ts` | Forward `signInWithWikimedia` to offscreen |

No new files needed.

---

## Task 1: PWA — Add signInWithWikimedia

**Files:**
- Modify: `packages/pwa/src/lib/stores/auth.svelte.ts`

- [ ] **Step 1: Add signInWithWikimedia function**

Add after the existing `signInWithGoogle`:

```typescript
export async function signInWithWikimedia(): Promise<{ error?: string }> {
  localStorage.setItem("pendingAuthUpgrade", "true");
  // Sign out any existing anonymous session before OAuth redirect
  const { data: session } = await supabase.auth.getSession();
  if (session?.session?.user?.is_anonymous) {
    await supabase.auth.signOut({ scope: "local" });
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "custom:wikimedia" as any,
    options: {
      redirectTo: window.location.origin + "/settings",
    },
  });
  if (error) return { error: error.message };
  return {};
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/pwa/src/lib/stores/auth.svelte.ts
git commit -m "feat(pwa): add signInWithWikimedia auth function"
```

---

## Task 2: PWA — Add Wikipedia sign-in button

**Files:**
- Modify: `packages/pwa/src/routes/settings/+page.svelte`

- [ ] **Step 1: Import signInWithWikimedia**

Add to the imports:
```typescript
import { authState, signInWithGoogle, signInWithWikimedia, signInWithEmail, signUpWithEmail, signOut } from "$lib/stores/auth.svelte";
```

- [ ] **Step 2: Add handler**

```typescript
async function handleWikimediaSignIn() {
  authError = "";
  const result = await signInWithWikimedia();
  if (result.error) authError = result.error;
}
```

- [ ] **Step 3: Add button in the auth section**

After the Google sign-in button, add:

```svelte
<button class="btn-wikimedia" onclick={handleWikimediaSignIn}>
  Sign in with Wikipedia
</button>
```

- [ ] **Step 4: Add button style**

```css
.btn-wikimedia {
  width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;
  background: white; cursor: pointer; font-size: 14px; font-weight: 500;
  margin-top: 8px;
}
.btn-wikimedia:hover { background: #f8f8f8; }
```

- [ ] **Step 5: Build and verify**

Run: `pnpm --filter pwa build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add packages/pwa/src/routes/settings/+page.svelte
git commit -m "feat(pwa): add Wikipedia sign-in button on settings page"
```

---

## Task 3: Extension — Add Wikimedia OAuth message type

**Files:**
- Modify: `packages/extension/src/shared/messaging.ts`
- Modify: `packages/extension/src/background/index.ts`

- [ ] **Step 1: Add message type**

In `messaging.ts`, add to `OffscreenRequest`:
```typescript
| { type: "signInWithWikimedia"; redirectUrl: string }
```

Add to `BackgroundMessage`:
```typescript
| { type: "signInWithWikimedia" }
```

- [ ] **Step 2: Forward in background**

In `background/index.ts`, add `"signInWithWikimedia"` to the existing auth message forwarding switch case (alongside `signInWithGoogle`, `signInWithEmail`, etc.).

- [ ] **Step 3: Commit**

```bash
git add packages/extension/src/shared/messaging.ts packages/extension/src/background/index.ts
git commit -m "feat(extension): add signInWithWikimedia message type"
```

---

## Task 4: Extension — Implement Wikimedia OAuth flow

**Files:**
- Modify: `packages/extension/src/offscreen/auth-handler.ts`

The extension can't do a normal browser redirect for OAuth. It uses `chrome.identity.launchWebAuthFlow` which opens a popup window. For Supabase custom providers, we construct the Supabase auth URL and let the popup handle the redirect.

- [ ] **Step 1: Add signInWithWikimedia handler**

Add a new case in `handleAuthMessage`:

```typescript
case "signInWithWikimedia": {
  // Construct the Supabase OAuth URL for the custom provider
  const supabase = getSupabaseClient();
  const redirectUrl = chrome.identity.getRedirectURL();

  // Use Supabase's OAuth endpoint directly
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const authUrl = `${supabaseUrl}/auth/v1/authorize?provider=custom:wikimedia&redirect_to=${encodeURIComponent(redirectUrl)}`;

  try {
    const responseUrl = await new Promise<string>((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        { url: authUrl, interactive: true },
        (callbackUrl) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (callbackUrl) {
            resolve(callbackUrl);
          } else {
            reject(new Error("No callback URL"));
          }
        }
      );
    });

    // Extract tokens from the callback URL hash
    const hash = new URL(responseUrl).hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (accessToken && refreshToken) {
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) return { success: false, error: error.message };
      return { success: true, data: { user: data.user } };
    }

    return { success: false, error: "No tokens in callback" };
  } catch (err: any) {
    return { success: false, error: err.message ?? "Wikimedia sign-in failed" };
  }
}
```

- [ ] **Step 2: Register redirect URL with Supabase**

The `chrome.identity.getRedirectURL()` returns something like `https://<extension-id>.chromiumapp.org/`. This needs to be added as an allowed redirect URL in:
- Supabase Dashboard > Auth > URL Configuration > Redirect URLs

- [ ] **Step 3: Build and verify**

Run: `pnpm --filter extension build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add packages/extension/src/offscreen/auth-handler.ts
git commit -m "feat(extension): implement Wikimedia OAuth via launchWebAuthFlow"
```

---

## Task 5: Extension — Add Wikipedia sign-in button

**Files:**
- Modify: `packages/extension/src/options/SettingsForm.svelte`

- [ ] **Step 1: Add handler**

Add alongside the existing `handleGoogleSignIn`:

```typescript
async function handleWikimediaSignIn() {
  authError = "";
  const response = await chrome.runtime.sendMessage({ type: "signInWithWikimedia" });
  if (response?.success) {
    await loadAuthStatus();
    await chrome.runtime.sendMessage({ type: "reinitSync" });
  } else {
    authError = response?.error ?? "Wikipedia sign-in failed";
  }
}
```

- [ ] **Step 2: Add button**

After the Google sign-in button:

```svelte
<button type="button" class="btn-wikimedia" onclick={handleWikimediaSignIn}>
  Sign in with Wikipedia
</button>
```

- [ ] **Step 3: Add style**

```css
.btn-wikimedia {
  width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;
  background: white; cursor: pointer; font-size: 14px; font-weight: 500;
  margin-top: 8px;
}
.btn-wikimedia:hover { background: #f8f8f8; }
```

- [ ] **Step 4: Build all and verify**

Run: `pnpm -r build`
Expected: All packages build

- [ ] **Step 5: Commit**

```bash
git add packages/extension/src/options/SettingsForm.svelte
git commit -m "feat(extension): add Wikipedia sign-in button on settings page"
```

---

## Task 6: Manual Testing

- [ ] **Step 1: Test PWA Wikimedia sign-in**

1. Go to PWA settings
2. Enable sync, click "Sign in with Wikipedia"
3. Wikimedia authorization page should appear
4. After authorizing, redirected back to settings, signed in
5. Sync should work

- [ ] **Step 2: Test extension Wikimedia sign-in**

1. Open extension settings
2. Enable sync, click "Sign in with Wikipedia"
3. Chrome identity popup should appear with Wikimedia authorization
4. After authorizing, settings should show signed in
5. Sync should work

- [ ] **Step 3: Test cross-platform**

1. Sign in with Wikimedia on PWA
2. Sign in with Wikimedia on extension
3. Both should have the same Supabase user ID
4. Sync should work between them

- [ ] **Step 4: Final commit and push**

```bash
git push
```

---

## Notes

- The `custom:wikimedia` provider identifier may vary based on what Supabase generates. Check the dashboard after configuration.
- The extension's `launchWebAuthFlow` approach is the same pattern used for Google OAuth — it opens a popup, handles the redirect, and extracts tokens from the callback URL.
- If Supabase returns tokens via query params instead of hash fragment for custom providers, the token extraction in Task 4 may need adjustment (check `responseUrl` format during testing).
- The Chrome extension redirect URL (`https://<extension-id>.chromiumapp.org/`) must be added to Supabase's allowed redirect URLs.
