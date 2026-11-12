// Genera URL firmati per Cloudflare R2.
// - action "put": solo chiavi sotto <user_id>/ (upload della propria foto)
// - action "get": qualsiasi chiave ben formata (le chiavi contengono UUID non indovinabili)
import { AwsClient } from "npm:aws4fetch@1.0.20";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const KEY_RE = /^[0-9a-f-]{36}\/[A-Za-z0-9_-]{1,80}\.(jpg|jpeg|png|webp)$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return json({ error: "unauthorized" }, 401);

  let body: { action?: string; keys?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  const action = body.action;
  if (action !== "put" && action !== "get") return json({ error: "invalid_action" }, 400);
  if (!Array.isArray(body.keys) || body.keys.length === 0 || body.keys.length > 30) {
    return json({ error: "invalid_keys" }, 400);
  }
  const keys = body.keys.filter((k): k is string => typeof k === "string" && KEY_RE.test(k));
  if (keys.length !== body.keys.length) return json({ error: "invalid_keys" }, 400);

  if (action === "put" && keys.some((k) => !k.startsWith(`${user.id}/`))) {
    return json({ error: "forbidden_key" }, 403);
  }

  const accountId = Deno.env.get("R2_ACCOUNT_ID");
  const bucket = Deno.env.get("R2_BUCKET");
  const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const endpoint = Deno.env.get("R2_ENDPOINT") ?? (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : null);

  if (!bucket || !accessKeyId || !secretAccessKey || !endpoint) {
    return json({ error: "r2_not_configured" }, 500);
  }

  const r2 = new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: "s3",
    region: "auto",
  });

  const expiresIn = 3600;

  try {
    const urls = await Promise.all(
      keys.map(async (key) => {
        const url = new URL(`${endpoint}/${bucket}/${key}`);
        url.searchParams.set("X-Amz-Expires", String(expiresIn));
        const signed = await r2.sign(url.toString(), {
          method: action === "put" ? "PUT" : "GET",
          aws: { signQuery: true },
        });
        return { key, url: signed.url };
      }),
    );
    return json({ urls, expiresIn });
  } catch (e) {
    console.error("r2_sign_failed", e);
    return json({ error: "sign_failed" }, 500);
  }
});
