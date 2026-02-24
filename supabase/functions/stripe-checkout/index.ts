// stripe-checkout: Create Stripe Checkout Session for advertiser wallet deposits
// Returns { url } for redirect to Stripe-hosted checkout page

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";
import { corsHeaders } from "../_shared/cors.ts";

const MINIMUM_DEPOSIT_CENTS = 1000; // $10

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2024-04-10",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Auth check
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);

    if (!user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // Get advertiser
    const { data: advertiser, error: advError } = await supabase
      .from("advertisers")
      .select("id, name, stripe_customer_id")
      .eq("auth_user_id", user.id)
      .single();

    if (advError || !advertiser) {
      return jsonResponse({ error: "Advertiser not found" }, 404);
    }

    const { amount_cents } = await req.json() as { amount_cents: number };

    if (!amount_cents || amount_cents < MINIMUM_DEPOSIT_CENTS) {
      return jsonResponse(
        { error: `Minimum deposit is $${(MINIMUM_DEPOSIT_CENTS / 100).toFixed(2)}` },
        400
      );
    }

    // Create or reuse Stripe Customer
    let stripeCustomerId = advertiser.stripe_customer_id;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: advertiser.name,
        metadata: {
          advertiser_id: String(advertiser.id),
          supabase_user_id: user.id,
        },
      });
      stripeCustomerId = customer.id;

      await supabase
        .from("advertisers")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("id", advertiser.id);
    }

    const portalUrl = Deno.env.get("PORTAL_URL") || "https://getnorma.app";

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: amount_cents,
            product_data: {
              name: "NORMA Ad Wallet Deposit",
              description: `Add $${(amount_cents / 100).toFixed(2)} to your advertising balance`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        advertiser_id: String(advertiser.id),
        deposit_amount_cents: String(amount_cents),
      },
      success_url: `${portalUrl}/billing?deposit=success`,
      cancel_url: `${portalUrl}/billing?deposit=cancelled`,
    });

    return jsonResponse({ url: session.url });
  } catch (error) {
    console.error("stripe-checkout error:", error);
    return jsonResponse({ error: (error as Error).message }, 500);
  }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
