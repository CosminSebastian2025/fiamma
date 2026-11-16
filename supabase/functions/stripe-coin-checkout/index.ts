// Crea una sessione Stripe Checkout per l'acquisto di un pacchetto monete.
// - richiede un utente autenticato (JWT Supabase)
// - il prezzo viene risolto dalla lookup key `coins_<pack_id>` creata dallo script catalogo
// - l'accredito avviene solo via webhook, mai dal client
import Stripe from "npm:stripe@18";
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
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return json({ error: "unauthorized" }, 401);

  let body: { packId?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  const packId = typeof body.packId === "string" ? body.packId : "";
  if (!/^[a-z0-9_]{1,40}$/.test(packId)) return json({ error: "invalid_pack" }, 400);

  const { data: pack, error: packError } = await supabase
    .from("coin_packs")
    .select("id, price_cents, currency")
    .eq("id", packId)
    .eq("active", true)
    .maybeSingle();
  if (packError) {
    console.error("pack_lookup_failed", packError);
    return json({ error: "pack_lookup_failed" }, 500);
  }
  if (!pack) return json({ error: "unknown_pack" }, 404);

  const secretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const appUrl = Deno.env.get("APP_URL")?.replace(/\/+$/, "");
  if (!secretKey || !appUrl) {
    console.error("stripe_not_configured", { hasKey: Boolean(secretKey), hasAppUrl: Boolean(appUrl) });
    return json({ error: "stripe_not_configured" }, 500);
  }

  const stripe = new Stripe(secretKey, { httpClient: Stripe.createFetchHttpClient() });

  try {
    const prices = await stripe.prices.list({
      lookup_keys: [`coins_${packId}`],
      active: true,
      limit: 1,
    });
    const price = prices.data[0];
    if (!price) {
      console.error("price_not_configured", packId);
      return json({ error: "price_not_configured" }, 500);
    }

    if (
      price.unit_amount !== pack.price_cents ||
      price.currency.toLowerCase() !== pack.currency.toLowerCase()
    ) {
      console.error("price_mismatch", {
        packId,
        stripeAmount: price.unit_amount,
        dbAmount: pack.price_cents,
      });
      return json({ error: "price_mismatch" }, 500);
    }

    const metadata = { kind: "coins", pack_id: packId, user_id: user.id };
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      locale: "it",
      line_items: [{ price: price.id, quantity: 1 }],
      client_reference_id: user.id,
      customer_email: user.email ?? undefined,
      metadata,
      payment_intent_data: { metadata },
      allow_promotion_codes: true,
      success_url: `${appUrl}/coins?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/coins?checkout=cancel`,
    });

    if (!session.url) return json({ error: "checkout_failed" }, 500);
    return json({ url: session.url });
  } catch (e) {
    console.error("checkout_failed", e);
    return json({ error: "checkout_failed" }, 500);
  }
});
