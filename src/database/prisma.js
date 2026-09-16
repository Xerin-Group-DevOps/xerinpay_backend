import { PrismaClient } from "@prisma/client"

// Single shared Prisma client. Tests inject a mock via
// src/database/prismaClient.js (see tests/helpers/mockPrisma.js) rather than
// hitting a live database, since this sandbox has no Postgres server.
export const prisma = new PrismaClient()
