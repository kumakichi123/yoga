// server/stripeHelpers.js
function mapStripeStatus(status) {
  if (!status) return 'free';
  if (status === 'active' || status === 'trialing') return status;
  if (status === 'past_due') return 'past_due';
  if (status === 'unpaid') return 'past_due';
  return 'free';
}

export async function syncStripeSubscription(supabase, subscription) {
  if (!supabase || !subscription) return;
  const userId = subscription.metadata?.user_id;
  if (!userId) {
    console.warn('Stripe subscription missing user_id metadata');
    return;
  }

  const normalizedStatus = mapStripeStatus(subscription.status);
  const periodEndIso =
    subscription.current_period_end && normalizedStatus !== 'free'
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null;

  console.debug('syncStripeSubscription', {
    stripeStatus: subscription.status,
    normalizedStatus,
    periodEndIso,
    userId,
  });

  const payload = {
    user_id: userId,
    subscription_status: normalizedStatus,
    subscription_current_period_end: periodEndIso,
    subscription_provider: normalizedStatus === 'free' ? null : 'stripe',
    stripe_customer_id: typeof subscription.customer === 'string' ? subscription.customer : null,
    stripe_subscription_id: normalizedStatus === 'free' ? null : subscription.id,
  };

  console.debug('syncStripeSubscription payload', payload);

  const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'user_id' });
  if (error) {
    console.error('Supabase subscription sync error', error);
  }
}