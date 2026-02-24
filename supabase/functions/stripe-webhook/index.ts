// stripe-webhook: Handle Stripe webhook events
// Verifies signature, processes checkout.session.completed, credits advertiser balance
// No CORS, no auth — called directly by Stripe

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2024-04-10",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
    const signature = req.headers.get("stripe-signature");

    if (!signature) {
      return new Response("Missing stripe-signature header", { status: 400 });
    }

    const body = await req.text();

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        webhookSecret
      );
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return new Response("Invalid signature", { status: 400 });
    }

    if (event.type !== "checkout.session.completed") {
      // Acknowledge but ignore other event types
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    const session = event.data.object as Stripe.Checkout.Session;

    // Extract metadata
    const advertiserId = session.metadata?.advertiser_id;
    const depositAmountCents = session.metadata?.deposit_amount_cents;

    if (!advertiserId || !depositAmountCents) {
      console.error("Missing metadata on checkout session:", session.id);
      return new Response("Missing metadata", { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Credit advertiser balance (idempotent — checks for duplicate session_id)
    const { data: credited, error } = await supabase.rpc("add_advertiser_funds", {
      p_advertiser_id: parseInt(advertiserId, 10),
      p_amount_cents: parseInt(depositAmountCents, 10),
      p_session_id: session.id,
      p_payment_intent_id: typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null,
    });

    if (error) {
      console.error("add_advertiser_funds error:", error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    console.log(JSON.stringify({
      function: "stripe-webhook",
      event: "deposit_processed",
      advertiser_id: advertiserId,
      amount_cents: depositAmountCents,
      session_id: session.id,
      was_new: credited,
      timestamp: new Date().toISOString(),
    }));

    return new Response(JSON.stringify({ received: true, credited }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("stripe-webhook error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
    });
  }
});
