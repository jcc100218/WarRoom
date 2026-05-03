/**
 * fw-create-checkout — Create a Stripe Checkout Session
 *
 * POST /functions/v1/fw-create-checkout
 * Headers: { Authorization: Bearer <jwt> }
 * Body:    { productSlug, successUrl, cancelUrl }
 *
 * Returns: { checkoutUrl }
 *
 * Required secrets:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   STRIPE_SECRET_KEY
 *   STRIPE_PRICE_WAR_ROOM         (Dynasty HQ War Room — price_1TCSAPBzhLLVa13Q3A2l8DP2)
 *   STRIPE_PRICE_DYNASTY_HQ       (Dynasty HQ      — price_1TCSJZBzhLLVa13Qitxwr8sh)
 *   STRIPE_PRICE_FANTASY_WARS_PRO (legacy env name for Pro Bundle — price_1TCSNSBzhLLVa13QnT3hsQLC)
 *
 * To set Price IDs:
 *   supabase secrets set STRIPE_PRICE_WAR_ROOM=price_...
 *   supabase secrets set STRIPE_PRICE_DYNASTY_HQ=price_...
 *   supabase secrets set STRIPE_PRICE_FANTASY_WARS_PRO=price_...
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@14';
import {
  auditEvent,
  checkRateLimit,
  clientIp,
  handleOptions,
  json,
  requireActiveAppSession,
} from '../_shared/security.ts';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_SECRET_KEY    = Deno.env.get('STRIPE_SECRET_KEY')!;

// Map product slugs → Stripe Price IDs
const PRICE_MAP: Record<string, string | undefined> = {
  war_room:  Deno.env.get('STRIPE_PRICE_WAR_ROOM'),
  dynast_hq: Deno.env.get('STRIPE_PRICE_DYNASTY_HQ'),
  bundle:    Deno.env.get('STRIPE_PRICE_FANTASY_WARS_PRO'),
};

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    // ── Verify JWT and extract user ───────────────────────────
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const session = await requireActiveAppSession(admin, req);
    if (!session) return json(req, { error: 'Invalid session token.' }, 401);
    const userId = session.userId;
    const userEmail = session.email || undefined;

    const { productSlug: rawProductSlug = 'war_room', successUrl, cancelUrl } = await req.json();
    const productSlug = normalizeProductSlug(rawProductSlug);

    const priceId = PRICE_MAP[productSlug];
    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
    const rateLimit = await checkRateLimit(admin, 'fw-create-checkout:user', userId, { limit: 10, windowSeconds: 3600, lockoutSeconds: 900 });
    const ipLimit = await checkRateLimit(admin, 'fw-create-checkout:ip', clientIp(req), { limit: 30, windowSeconds: 3600, lockoutSeconds: 900 });
    if (!rateLimit.allowed || !ipLimit.allowed) {
      await auditEvent(admin, req, 'checkout_create', 'blocked', { userId, email: userEmail }, { reason: 'rate_limited', productSlug });
      return json(req, { error: 'Too many checkout attempts. Try again later.' }, 429);
    }
    if (!priceId) {
      await auditEvent(admin, req, 'checkout_create', 'failure', { userId, email: userEmail }, { reason: 'missing_price', productSlug });
      return json(req, { error: `No Stripe price configured for "${productSlug}".` }, 400);
    }

    // ── Get or create Stripe customer ─────────────────────────
    const { data: appUser } = await admin
      .from('app_users')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single();

    let customerId = appUser?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email:    userEmail,
        metadata: { user_id: userId },
      });
      customerId = customer.id;
      await admin
        .from('app_users')
        .update({ stripe_customer_id: customerId })
        .eq('id', userId);
    }

    // ── Create Checkout Session ───────────────────────────────
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode:     'subscription',
      line_items: [{
        price:    priceId,
        quantity: 1,
      }],
      success_url: successUrl ?? `${SUPABASE_URL}/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  cancelUrl  ?? `${SUPABASE_URL}/landing.html`,
      subscription_data: {
        metadata: {
          user_id:      userId,
          product_slug: productSlug,
        },
      },
      allow_promotion_codes: true,
    });

    await auditEvent(admin, req, 'checkout_create', 'success', { userId, email: userEmail }, { productSlug, stripeSessionId: session.id });
    return json(req, { checkoutUrl: session.url });

  } catch (err) {
    console.error('fw-create-checkout error:', err);
    return json(req, { error: 'Failed to create checkout session.' }, 500);
  }
});

function normalizeProductSlug(value: unknown): string {
  const raw = String(value || 'war_room').trim().toLowerCase();
  const aliases: Record<string, string> = {
    'war-room': 'war_room',
    warroom: 'war_room',
    'dynasty-hq': 'dynast_hq',
    dynasty_hq: 'dynast_hq',
    scout: 'dynast_hq',
    pro: 'bundle',
  };
  return aliases[raw] || raw;
}
