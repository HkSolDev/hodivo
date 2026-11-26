import { PrismaClient } from '../generated/prisma/index.js';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
export const prisma = new PrismaClient({ adapter });

// Read-only slave-db client for public reads; falls back to the master when unset.
const slaveUrl = process.env.SLAVE_DATABASE_URL?.trim();
export const prismaRead: PrismaClient =
  slaveUrl && slaveUrl !== process.env.DATABASE_URL?.trim()
    ? new PrismaClient({
        adapter: new PrismaPg({ connectionString: slaveUrl }),
      })
    : prisma;
