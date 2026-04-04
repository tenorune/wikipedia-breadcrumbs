import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const WIKIMEDIA_CLIENT_ID = Deno.env.get("WIKIMEDIA_CLIENT_ID")!;
const WIKIMEDIA_CLIENT_SECRET = Deno.env.get("WIKIMEDIA_CLIENT_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OAUTH_STATE_SECRET = Deno.env.get("OAUTH_STATE_SECRET") ?? SUPABASE_SERVICE_ROLE_KEY;

const WIKIMEDIA_TOKEN_URL = "https://meta.wikimedia.org/w/rest.php/oauth2/access_token";
const WIKIMEDIA_PROFILE_URL = "https://meta.wikimedia.org/w/rest.php/oauth2/resource/profile";
const CALLBACK_URL = `${SUPABASE_URL}/functions/v1/wikimedia-oauth`;

// Allowed redirect origins — only our own domains
const ALLOWED_ORIGINS = [
  "https://breadcrumbs-17c29.web.app",
  "https://breadcrumbs-17c29--dev-fqixmewt.web.app",
  "http://localhost:5173",
  "http://localhost:4173",
];

// Also allow chromiumapp.org extension callbacks
function isAllowedRedirect(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.endsWith(".chromiumapp.org")) return true;
    const origin = parsed.origin;
    return ALLOWED_ORIGINS.some((allowed) => origin === allowed || origin.startsWith(allowed.replace(/\/$/, "")));
  } catch {
    return false;
  }
}

// HMAC-sign the state to prevent CSRF and tampering
async function signState(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(OAUTH_STATE_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyState(data: string, signature: string): Promise<boolean> {
  const expected = await signState(data);
  return expected === signature;
}

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowed = ALLOWED_ORIGINS.includes(origin)
    || origin.endsWith(".chromiumapp.org")
    || origin.startsWith("chrome-extension://");
  return {
    "Access-Control-Allow-Origin": allowed ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const action = url.searchParams.get("action");

  // Step 1: Client calls ?action=authorize to get the Wikimedia auth URL
  if (action === "authorize") {
    const redirectTo = url.searchParams.get("redirect_to") ?? "";

    // Validate redirect URL against allowlist
    if (redirectTo && !isAllowedRedirect(redirectTo)) {
      return new Response(JSON.stringify({ error: "Invalid redirect URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sign the state to prevent tampering
    const stateData = JSON.stringify({ redirect_to: redirectTo, ts: Date.now() });
    const signature = await signState(stateData);
    const state = btoa(JSON.stringify({ d: stateData, s: signature }));

    const authUrl = new URL("https://meta.wikimedia.org/w/rest.php/oauth2/authorize");
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", WIKIMEDIA_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", CALLBACK_URL);
    authUrl.searchParams.set("state", state);

    return new Response(JSON.stringify({ url: authUrl.toString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Step 2: Wikimedia redirects here with ?code=...&state=...
  if (code) {
    const stateParam = url.searchParams.get("state") ?? "";
    let redirectTo = "";

    // Verify state signature
    try {
      const stateEnvelope = JSON.parse(atob(stateParam));
      const isValid = await verifyState(stateEnvelope.d, stateEnvelope.s);
      if (!isValid) {
        console.error("[oauth] Invalid state signature");
        return new Response("Invalid state", { status: 403 });
      }
      const stateData = JSON.parse(stateEnvelope.d);
      redirectTo = stateData.redirect_to ?? "";

      // Reject expired states (10 min window)
      if (Date.now() - stateData.ts > 600000) {
        console.error("[oauth] State expired");
        return new Response("State expired", { status: 403 });
      }
    } catch {
      console.error("[oauth] Failed to parse state");
      return new Response("Invalid state", { status: 403 });
    }

    // Re-validate redirect URL
    if (redirectTo && !isAllowedRedirect(redirectTo)) {
      return new Response("Invalid redirect", { status: 403 });
    }

    try {
      // Exchange code for access token
      const tokenResp = await fetch(WIKIMEDIA_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: WIKIMEDIA_CLIENT_ID,
          client_secret: WIKIMEDIA_CLIENT_SECRET,
          redirect_uri: CALLBACK_URL,
        }),
      });

      if (!tokenResp.ok) {
        const text = await tokenResp.text();
        console.error("[oauth] Token exchange failed:", tokenResp.status, text);
        return redirectWithError(redirectTo, "Authentication failed. Please try again.");
      }

      const tokenData = await tokenResp.json();
      const accessToken = tokenData.access_token;

      // Fetch Wikimedia user profile
      const profileResp = await fetch(WIKIMEDIA_PROFILE_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!profileResp.ok) {
        console.error("[oauth] Profile fetch failed:", profileResp.status);
        return redirectWithError(redirectTo, "Authentication failed. Please try again.");
      }

      const profile = await profileResp.json();
      const wikimediaUsername = profile.username;
      const wikimediaSub = String(profile.sub);
      const email = profile.email || null;

      // Create or find the Supabase user
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const userEmail = email ?? `wikimedia-${wikimediaSub}@wikipedia-breadcrumbs.local`;

      const { data: users } = await supabase.auth.admin.listUsers();
      let existingUser = users?.users?.find(
        (u) => u.user_metadata?.wikimedia_sub === wikimediaSub
      );

      if (!existingUser) {
        existingUser = users?.users?.find((u) => u.email === userEmail);
      }

      if (existingUser) {
        await supabase.auth.admin.updateUserById(existingUser.id, {
          user_metadata: {
            ...existingUser.user_metadata,
            wikimedia_sub: wikimediaSub,
            wikimedia_username: wikimediaUsername,
            provider: "wikimedia",
          },
        });
      } else {
        const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
          email: userEmail,
          email_confirm: true,
          user_metadata: {
            wikimedia_sub: wikimediaSub,
            wikimedia_username: wikimediaUsername,
            provider: "wikimedia",
          },
        });

        if (createError || !newUser.user) {
          console.error("[oauth] Create user failed:", createError?.message);
          return redirectWithError(redirectTo, "Authentication failed. Please try again.");
        }
      }

      // Generate a magic link to create a session
      const { data: linkData, error: linkError } =
        await supabase.auth.admin.generateLink({
          type: "magiclink",
          email: userEmail,
        });

      if (linkError || !linkData) {
        console.error("[oauth] Generate link failed:", linkError?.message);
        return redirectWithError(redirectTo, "Authentication failed. Please try again.");
      }

      const hashedToken = linkData.properties?.hashed_token;
      const verificationType = linkData.properties?.verification_type;

      if (hashedToken) {
        const verifyUrl = `${SUPABASE_URL}/auth/v1/verify?token=${hashedToken}&type=${verificationType}&redirect_to=${encodeURIComponent(redirectTo)}`;
        return Response.redirect(verifyUrl, 302);
      }

      return redirectWithError(redirectTo, "Authentication failed. Please try again.");
    } catch (err) {
      console.error("[oauth] Unexpected error:", (err as Error).message);
      return redirectWithError(redirectTo, "Authentication failed. Please try again.");
    }
  }

  return new Response(JSON.stringify({ error: "Unknown request" }), {
    status: 400,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

function redirectWithError(redirectTo: string, error: string): Response {
  if (redirectTo) {
    return Response.redirect(`${redirectTo}?wikimedia_error=${encodeURIComponent(error)}`, 302);
  }
  return new Response(error, { status: 400 });
}
