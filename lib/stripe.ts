import Stripe from 'stripe';

export const PLANS = {
  free: {
    name: 'Free',
    price: 0,
    interval: null as null,
    features: [
      'До 5 markets в watchlist',
      'Бесплатный Telegram бот',
      'Уведомления за 24 часа',
    ],
  },
  pro: {
    name: 'Pro',
    price: 499, // $4.99
    interval: 'month' as const,
    features: [
      'Unlimited watchlist',
      'Priority Telegram alerts',
      'Уведомления за 48 часов',
      'Email digest (daily)',
    ],
  },
  trader: {
    name: 'Trader',
    price: 1499, // $14.99
    interval: 'month' as const,
    features: [
      'Все из Pro',
      'Уведомления за 72 часа',
      'Copy-trading signals',
      'Priority support',
    ],
  },
} as const;

export type PlanKey = keyof typeof PLANS;

// Lazy Stripe instance — avoids build-time initialization error
let _stripe: Stripe | null = null;
export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
      apiVersion: '2026-04-22.dahlia',
    });
  }
  return _stripe;
}
