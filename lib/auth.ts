import jwt from 'jsonwebtoken';
import { getUser, setUser, removeProUser } from '@/lib/redis';
import type { UserStore } from '@/lib/redis';

const JWT_SECRET = process.env.JWT_SECRET || 'rc-secret-change-me-in-vercel';
const SESSION_DURATION = 7 * 24 * 60 * 60; // 7 days

export interface SessionPayload {
  userId: string;
  iat: number;
  exp: number;
}

export function createToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: SESSION_DURATION });
}

export function verifyToken(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as SessionPayload;
  } catch {
    return null;
  }
}

export function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach(c => {
    const [k, ...v] = c.trim().split('=');
    if (k) cookies[k] = v.join('=');
  });
  return cookies;
}

export function getSessionFromRequest(request: Request): Promise<{ user: UserStore; token: string } | null> {
  const cookieHeader = request.headers.get('cookie') || '';
  const cookies = parseCookies(cookieHeader);
  const token = cookies['rc_session'];
  if (!token) return Promise.resolve(null);

  const payload = verifyToken(token);
  if (!payload) return Promise.resolve(null);

  return getUser(payload.userId).then(async user => {
    if (!user) return null;

    // Check if subscription expired based on currentPeriodEnd
    if (user.subscription.status === 'active' && user.subscription.currentPeriodEnd) {
      if (new Date(user.subscription.currentPeriodEnd) < new Date()) {
        user.subscription = {
          plan: 'free',
          status: 'inactive',
        };
        await setUser(payload.userId, user);
        if (user.chat_id) {
          await removeProUser(user.chat_id);
        }
      }
    }

    return { user, token };
  });
}

export async function requireAuth(request: Request): Promise<{ user: UserStore; token: string }> {
  const session = await getSessionFromRequest(request);
  if (!session) {
    throw new Error('Unauthorized');
  }
  return session;
}

export function makeSessionCookie(token: string): string {
  return `rc_session=${token}; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DURATION}; Path=/`;
}

export function clearSessionCookie(): string {
  return 'rc_session=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/';
}
