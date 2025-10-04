import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import getRawBody from 'raw-body';
import { syncStripeSubscription } from '../../server/stripeHelpers.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

function missingEnv(name: string): never {
  throw new Error(`Missing environment variable: ${name}`);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  let stripeSecret: string;
  let webhookSecret: string;
  let supabaseUrl: string;
  let supabaseServiceKey: string;

  try {
    stripeSecret = process.env.STRIPE_SECRET_KEY ?? missingEnv('STRIPE_SECRET_KEY');
    webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? missingEnv('STRIPE_WEBHOOK_SECRET');
    supabaseUrl = process.env.SUPABASE_URL ?? missingEnv('SUPABASE_URL');
    supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY ?? missingEnv('SUPABASE_SERVICE_KEY');
  } catch (err) {
    console.error('Stripe webhook missing configuration', err);
    return res.status(500).json({ error: 'server_config_invalid' });
  }

  let rawBody: Buffer;
  try {
    rawBody = await getRawBody(req);
  } catch (err) {
    console.error('Failed to read request body', err);
    return res.status(400).json({ error: 'invalid_body' });
  }

  const stripe = new Stripe(stripeSecret, { apiVersion: '2024-06-20' });
  const signature = req.headers['stripe-signature'];
  if (!signature) {
    return res.status(400).json({ error: 'missing_signature' });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('Stripe signature verification failed', err);
    return res.status(400).json({ error: 'invalid_signature' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const subscriptionId = session.subscription;
        if (subscriptionId && typeof subscriptionId === 'string') {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          await syncStripeSubscription(supabase, subscription);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await syncStripeSubscription(supabase, subscription);
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.subscription && typeof invoice.subscription === 'string') {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
          await syncStripeSubscription(supabase, subscription);
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error('Stripe webhook processing error', err);
    return res.status(500).json({ error: 'webhook_processing_failed' });
  }

  return res.status(200).json({ received: true });
}
