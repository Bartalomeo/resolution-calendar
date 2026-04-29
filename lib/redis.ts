import { Redis } from '@upstash/redis';

// Upstash Redis — shared across all Lambda instances (Vercel cold start safe)
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export interface UserStore {
  chat_id: number;
  username: string;
  subscribed: boolean;
  watchlist: string[];
  addedAt: string;
}

// KEYS
const userKey = (userId: string) => `rc:user:${userId}`;
const chatIdIndex = (chatId: number) => `rc:chatid:${chatId}`;

export async function getUser(userId: string): Promise<UserStore | null> {
  const data = await redis.get<UserStore>(userKey(userId));
  return data;
}

export async function setUser(userId: string, user: UserStore): Promise<void> {
  await redis.set(userKey(userId), user, { keepTtl: true });
}

export async function deleteUser(userId: string): Promise<void> {
  await redis.del(userKey(userId));
}

// Get userId by chat_id (reverse index)
export async function getUserIdByChatId(chatId: number): Promise<string | null> {
  const userId = await redis.get<string>(chatIdIndex(chatId));
  return userId;
}

export async function setChatIdIndex(chatId: number, userId: string): Promise<void> {
  await redis.set(chatIdIndex(chatId), userId, { keepTtl: true });
}

export async function deleteChatIdIndex(chatId: number): Promise<void> {
  await redis.del(chatIdIndex(chatId));
}

// Get all user IDs (for cron iteration)
export async function getAllUserIds(): Promise<string[]> {
  const keys = await redis.keys('rc:user:*');
  return keys.map(k => k.replace('rc:user:', ''));
}

// Add to watchlist
export async function addToWatchlist(userId: string, marketId: string): Promise<string[]> {
  const user = await getUser(userId);
  if (!user) return [];
  if (!user.watchlist.includes(marketId)) {
    user.watchlist.push(marketId);
    await setUser(userId, user);
  }
  return user.watchlist;
}

// Remove from watchlist
export async function removeFromWatchlist(userId: string, marketId: string): Promise<string[]> {
  const user = await getUser(userId);
  if (!user) return [];
  user.watchlist = user.watchlist.filter(id => id !== marketId);
  await setUser(userId, user);
  return user.watchlist;
}

export { redis };
