import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-04-22.dahlia',
});

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
    priceId: process.env.STRIPE_PRO_PRICE_ID!,
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
    priceId: process.env.STRIPE_TRADER_PRICE_ID!,
    features: [
      'Все из Pro',
      'Уведомления за 72 часа',
      'Copy-trading signals',
      'Priority support',
    ],
  },
} as const;

export type PlanKey = keyof typeof PLANS;
