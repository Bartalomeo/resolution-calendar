import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export { redis };

export interface Subscription {
  plan: 'free' | 'pro';
  status: 'active' | 'inactive' | 'canceled';
  stripeSessionId?: string; // deprecated
  currentPeriodEnd?: string;
}

export interface UserStore {
  userId: string;
  username?: string;
  passwordHash?: string;
  chat_id?: number;
  subscribed: boolean;
  watchlist: string[];
  addedAt: string;
  subscription: Subscription;
}

// KEYS
const userKey = (userId: string) => `rc:user:${userId}`;
const chatIdIndex = (chatId: number) => `rc:chatid:${chatId}`;
const paymentKey = (ref: string) => `rc:payment:${ref}`;

// --- User ---
export async function getUser(userId: string): Promise<UserStore | null> {
  return redis.get<UserStore>(userKey(userId));
}

export async function setUser(userId: string, user: UserStore): Promise<void> {
  await redis.set(userKey(userId), user, { keepTtl: true });
}

export async function deleteUser(userId: string): Promise<void> {
  await redis.del(userKey(userId));
}

export async function getUserIdByChatId(chatId: number): Promise<string | null> {
  return redis.get<string>(chatIdIndex(chatId));
}

export async function setChatIdIndex(chatId: number, userId: string): Promise<void> {
  await redis.set(chatIdIndex(chatId), userId, { keepTtl: true });
}

export async function deleteChatIdIndex(chatId: number): Promise<void> {
  await redis.del(chatIdIndex(chatId));
}

// --- Pro Users Set ---
export async function addProUser(chatId: number): Promise<void> {
  await redis.sadd('pro_users', String(chatId));
}

export async function removeProUser(chatId: number): Promise<void> {
  await redis.srem('pro_users', String(chatId));
}

export async function getAllUserIds(): Promise<string[]> {
  const keys = await redis.keys('rc:user:*');
  return keys.map(k => k.replace('rc:user:', ''));
}

// --- Watchlist (stored in user object) ---
export async function addToWatchlist(userId: string, marketId: string): Promise<string[]> {
  const user = await getUser(userId);
  if (!user) return [];
  if (!user.watchlist.includes(marketId)) {
    user.watchlist.push(marketId);
    await setUser(userId, user);
  }
  return user.watchlist;
}

export async function removeFromWatchlist(userId: string, marketId: string): Promise<string[]> {
  const user = await getUser(userId);
  if (!user) return [];
  user.watchlist = user.watchlist.filter(id => id !== marketId);
  await setUser(userId, user);
  return user.watchlist;
}

// --- Payment ---
export interface PaymentStore {
  ref: string;
  userId: string;
  plan: 'free' | 'pro';
  chain: string;
  address: string;
  amount: string;
  currency: string;
  status: 'pending' | 'confirmed' | 'expired';
  txHash?: string;
  createdAt: string;
  expiresAt: string;
}

export async function getPayment(ref: string): Promise<PaymentStore | null> {
  return redis.get<PaymentStore>(paymentKey(ref));
}

export async function setPayment(ref: string, payment: PaymentStore): Promise<void> {
  await redis.set(paymentKey(ref), payment, { keepTtl: true });
}

export async function updatePaymentStatus(
  ref: string,
  status: 'pending' | 'confirmed' | 'expired',
  txHash?: string
): Promise<void> {
  const payment = await getPayment(ref);
  if (!payment) return;
  payment.status = status;
  if (txHash) payment.txHash = txHash;
  await setPayment(ref, payment);
}
