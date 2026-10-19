import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const ALLOWED_ORIGIN = "https://med25-quiz-1-practice.onrender.com";
const ADMIN_EMAILS = new Set([
  "waleed.khashoggi@icloud.com",
  "waleed.k.khashoggi@gmail.com",
]);

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Vary": "Origin",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });
}

function namedKey(jsonName: string, legacyName: string) {
  try {
    const raw = Deno.env.get(jsonName);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.default) return parsed.default as string;
    }
  } catch {}
  return Deno.env.get(legacyName) ?? "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const origin = req.headers.get("origin");
  if (origin !== ALLOWED_ORIGIN) return json({ error: "Origin not allowed" }, 403);

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return json({ error: "Authentication required" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const publishableKey = namedKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const secretKey = namedKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !publishableKey || !secretKey) {
    return json({ error: "Server configuration error" }, 500);
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  const email = userData.user?.email?.trim().toLowerCase() ?? "";
  if (userError || !userData.user) return json({ error: "Invalid session" }, 401);
  if (!ADMIN_EMAILS.has(email)) return json({ error: "Admin access required" }, 403);

  const admin = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.rpc("get_admin_analytics");
  if (error) {
    console.error("Analytics RPC error:", error.message);
    return json({ error: "Could not load analytics" }, 500);
  }

  return json({ ok: true, analytics: data });
});
