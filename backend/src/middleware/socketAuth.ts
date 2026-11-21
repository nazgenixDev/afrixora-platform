import jwt from 'jsonwebtoken';
import type { DefaultEventsMap, Socket } from 'socket.io';
import { z } from 'zod';
import { prisma } from '../utils/database';
import { allowedOrigins } from './enforceOrigin';

export interface SocketData {
  user: { userId: string; tenantId: string; role: string };
}

type AuthSocket = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;

const tokenPayload = z.object({
  userId: z.string().min(1),
  tenantId: z.string().min(1),
  jwtVersion: z.number().int(),
});

function readAccessCookie(header: string | undefined): string | undefined {
  for (const entry of header?.split(';') ?? []) {
    const separator = entry.indexOf('=');
    if (separator !== -1 && entry.slice(0, separator).trim() === 'access_token') {
      return decodeURIComponent(entry.slice(separator + 1).trim());
    }
  }
}

export async function socketAuth(socket: AuthSocket, next: (error?: Error) => void): Promise<void> {
  try {
    const origin = socket.handshake.headers.origin;
    if (origin && !allowedOrigins().includes(origin)) return next(new Error('Origine refusée'));
    const cookie = readAccessCookie(socket.handshake.headers.cookie);
    const fallback: unknown = socket.handshake.auth.token;
    const token = cookie ?? fallback;
    const secret = process.env.JWT_SECRET;
    if (typeof token !== 'string' || !token || !secret) {
      return next(new Error('Unauthorized'));
    }

    const decoded = tokenPayload.parse(jwt.verify(token, secret, { algorithms: ['HS256'] }));
    const user = await prisma.user.findFirst({
      where: { id: decoded.userId, tenantId: decoded.tenantId },
      select: { jwtVersion: true, isActive: true, role: true, tenant: { select: { isActive: true } } },
    });

    if (!user || !user.isActive || user.jwtVersion !== decoded.jwtVersion ||
      (user.role !== 'SUPER_ADMIN' && !user.tenant.isActive)) {
      return next(new Error('Unauthorized'));
    }

    socket.data.user = { userId: decoded.userId, tenantId: decoded.tenantId, role: user.role };
  } catch {
    return next(new Error('Unauthorized'));
  }
  next();
}
