import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const WIKIMEDIA_CLIENT_ID = Deno.env.get("WIKIMEDIA_CLIENT_ID")!;
const WIKIMEDIA_CLIENT_SECRET = Deno.env.get("WIKIMEDIA_CLIENT_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const WIKIMEDIA_TOKEN_URL = "https://meta.wikimedia.org/w/rest.php/oauth2/access_token";
const WIKIMEDIA_PROFILE_URL = "https://meta.wikimedia.org/w/rest.php/oauth2/resource/profile";
const CALLBACK_URL = `${SUPABASE_URL}/functions/v1/wikimedia-oauth`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const action = url.searchParams.get("action");

  // Step 1: Client calls ?action=authorize to get the Wikimedia auth URL
  if (action === "authorize") {
    const redirectTo = url.searchParams.get("redirect_to") ?? "";
    // Encode redirect_to in the state parameter so it survives the round-trip
    const state = btoa(JSON.stringify({ redirect_to: redirectTo }));

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
    try {
      const stateData = JSON.parse(atob(stateParam));
      redirectTo = stateData.redirect_to ?? "";
    } catch {}

    try {
      // Exchange code for access token (must be x-www-form-urlencoded per Wikimedia)
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
        console.error("Token exchange failed:", tokenResp.status, text);
        return redirectWithError(redirectTo, `Token exchange failed: ${tokenResp.status}`);
      }

      const tokenData = await tokenResp.json();
      const accessToken = tokenData.access_token;

      // Fetch Wikimedia user profile
      const profileResp = await fetch(WIKIMEDIA_PROFILE_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!profileResp.ok) {
        return redirectWithError(redirectTo, "Failed to fetch Wikimedia profile");
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
          console.error("Create user failed:", createError);
          return redirectWithError(redirectTo, "Failed to create user");
        }
      }

      // Generate a magic link to create a session
      const { data: linkData, error: linkError } =
        await supabase.auth.admin.generateLink({
          type: "magiclink",
          email: userEmail,
        });

      if (linkError || !linkData) {
        console.error("Generate link failed:", linkError);
        return redirectWithError(redirectTo, "Failed to generate session");
      }

      const hashedToken = linkData.properties?.hashed_token;
      const verificationType = linkData.properties?.verification_type;

      if (hashedToken) {
        const verifyUrl = `${SUPABASE_URL}/auth/v1/verify?token=${hashedToken}&type=${verificationType}&redirect_to=${encodeURIComponent(redirectTo)}`;
        return Response.redirect(verifyUrl, 302);
      }

      return redirectWithError(redirectTo, "Failed to generate session token");
    } catch (err) {
      console.error("Wikimedia OAuth error:", err);
      return redirectWithError(redirectTo, String(err));
    }
  }

  return new Response(JSON.stringify({ error: "Unknown request" }), {
    status: 400,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

function redirectWithError(redirectTo: string, error: string): Response {
  const target = redirectTo
    ? `${redirectTo}?wikimedia_error=${encodeURIComponent(error)}`
    : `about:blank`;
  return Response.redirect(target, 302);
}
