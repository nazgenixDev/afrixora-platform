import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

// Prisma singleton
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
export const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// PostgreSQL pool for TimescaleDB raw queries
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
export const query = (text: string, params?: unknown[]) => pool.query(text, params);

export default prisma;
