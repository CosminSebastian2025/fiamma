// Webhook Stripe: accredita le monete dopo un pagamento Checkout riuscito.
// - verifica la firma del webhook
// - accredita tramite RPC atomica e idempotente `credit_coin_purchase`
// - in caso di errore risponde 500 così Stripe ritenta
import Stripe from "npm:stripe@18";
import { createClient } from "npm:@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const secretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secretKey || !webhookSecret) {
    console.error("stripe_not_configured");
    return json({ error: "stripe_not_configured" }, 500);
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return json({ error: "missing_signature" }, 400);

  const rawBody = await req.text();
  const stripe = new Stripe(secretKey, { httpClient: Stripe.createFetchHttpClient() });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch (e) {
    console.error("invalid_signature", e);
    return json({ error: "invalid_signature" }, 400);
  }

  if (
    event.type !== "checkout.session.completed" &&
    event.type !== "checkout.session.async_payment_succeeded"
  ) {
    return json({ received: true, ignored: event.type });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  if (session.mode !== "payment" || session.metadata?.kind !== "coins") {
    return json({ received: true, ignored: "not_coins" });
  }
  if (session.payment_status !== "paid") {
    return json({ received: true, ignored: `payment_status:${session.payment_status}` });
  }

  const userId = session.metadata?.user_id ?? session.client_reference_id ?? "";
  const packId = session.metadata?.pack_id ?? "";
  if (!UUID_RE.test(userId) || !/^[a-z0-9_]{1,40}$/.test(packId)) {
    console.error("invalid_metadata", { session: session.id, userId, packId });
    return json({ received: true, ignored: "invalid_metadata" });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data, error } = await admin.rpc("credit_coin_purchase", {
    p_user: userId,
    p_provider: "stripe",
    p_provider_ref: session.id,
    p_pack: packId,
    p_amount_cents: session.amount_total ?? 0,
    p_currency: session.currency ?? "eur",
  });

  if (error) {
    console.error("credit_failed", error);
    return json({ error: "credit_failed" }, 500);
  }

  console.log("coins_credited", {
    session: session.id,
    user: userId,
    pack: packId,
    balance: data,
  });
  return json({ received: true });
});
