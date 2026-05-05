import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";

process.env.DATABASE_URL = "file:./prisma/test.db";

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

beforeAll(async () => { //create test.db schema based on our dev.db schema incase its deleted
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Event" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "title" TEXT NOT NULL,
      "description" TEXT NOT NULL,
      "location" TEXT NOT NULL,
      "category" TEXT NOT NULL,
      "emoji" TEXT,
      "status" TEXT NOT NULL,
      "capacity" INTEGER,
      "startDatetime" DATETIME NOT NULL,
      "endDatetime" DATETIME NOT NULL,
      "organizerId" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )
  `);

  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Event" ADD COLUMN "emoji" TEXT`);
  } catch {
    // Older test databases may already have this optional column.
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "EventRsvp" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "eventId" INTEGER NOT NULL,
      "userId" TEXT NOT NULL,
      CONSTRAINT "EventRsvp_eventId_fkey"
        FOREIGN KEY ("eventId") REFERENCES "Event" ("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "EventRsvp_eventId_userId_key"
    ON "EventRsvp"("eventId", "userId")
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Comment" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "eventId" INTEGER NOT NULL,
      "userId" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Comment_eventId_fkey"
        FOREIGN KEY ("eventId") REFERENCES "Event" ("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
    )
  `);
});

beforeEach(async () => {
  await prisma.comment.deleteMany();
  await prisma.eventRsvp.deleteMany();
  await prisma.event.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});
