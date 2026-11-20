import type { DefaultEventsMap, Socket } from 'socket.io';
import { prisma } from '../utils/database';
import { verifyAccessToken } from '../utils/sessionTokens';

interface SocketSession {
  userId: string;
  tenantId: string;
  role: string;
  jwtVersion: number;
  expiresAt: number;
}

export interface SocketData {
  user: SocketSession;
}

export type AuthSocket = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;

export function readAccessCookie(header: string | undefined): string | undefined {
  for (const entry of header?.split(';') ?? []) {
    const separator = entry.indexOf('=');
    if (separator !== -1 && entry.slice(0, separator).trim() === 'access_token') {
      return entry.slice(separator + 1).trim();
    }
  }
}

const selectSocketAccount = {
  id: true,
  jwtVersion: true,
  isActive: true,
  role: true,
  tenantId: true,
  tenant: { select: { isActive: true } },
} as const;

type SocketAccount = {
  jwtVersion: number;
  isActive: boolean;
  role: string;
  tenantId: string;
  tenant: { isActive: boolean };
};

function isActiveAccount(account: SocketAccount | null | undefined, session: { tenantId: string; jwtVersion: number }) {
  return account?.isActive && account.tenantId === session.tenantId && account.jwtVersion === session.jwtVersion &&
    (account.role === 'SUPER_ADMIN' || account.tenant.isActive);
}

export function sessionRoom(userId: string, jwtVersion: number) {
  return `session:${userId}:${jwtVersion}`;
}

export async function isCurrentSocketSession(session: SocketSession) {
  if (session.expiresAt <= Date.now()) return false;
  const account = await prisma.user.findFirst({
    where: { id: session.userId, tenantId: session.tenantId },
    select: selectSocketAccount,
  });
  return isActiveAccount(account, session) && account?.role === session.role;
}

export async function revalidateSocketSessions(sockets: AuthSocket[]) {
  if (sockets.length === 0) return;
  const userIds = Array.from(new Set(sockets.map(({ data }) => data.user.userId)));
  const accounts = await prisma.user.findMany({ where: { id: { in: userIds } }, select: selectSocketAccount });
  const byId = new Map(accounts.map((account) => [account.id, account]));
  for (const socket of sockets) {
    const session = socket.data.user;
    const account = byId.get(session.userId);
    if (session.expiresAt <= Date.now() || !isActiveAccount(account, session) || account?.role !== session.role) {
      socket.disconnect(true);
    }
  }
}

export async function socketAuth(socket: AuthSocket, next: (error?: Error) => void): Promise<void> {
  try {
    const cookie = readAccessCookie(socket.handshake.headers.cookie);
    const token: unknown = cookie !== undefined ? decodeURIComponent(cookie) : socket.handshake.auth.token;
    const decoded = verifyAccessToken(token);
    if (!decoded?.exp) return next(new Error('Unauthorized'));
    const user = await prisma.user.findFirst({
      where: { id: decoded.userId, tenantId: decoded.tenantId },
      select: selectSocketAccount,
    });

    if (!user || !isActiveAccount(user, decoded)) {
      return next(new Error('Unauthorized'));
    }

    socket.data.user = {
      userId: decoded.userId,
      tenantId: decoded.tenantId,
      role: user.role,
      jwtVersion: decoded.jwtVersion,
      expiresAt: decoded.exp * 1000,
    };
  } catch {
    return next(new Error('Unauthorized'));
  }
  next();
}
