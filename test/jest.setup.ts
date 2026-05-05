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
      "status" TEXT NOT NULL,
      "capacity" INTEGER,
      "startDatetime" DATETIME NOT NULL,
      "endDatetime" DATETIME NOT NULL,
      "organizerId" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )
  `);

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

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "User" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "email" TEXT NOT NULL,
      "displayName" TEXT NOT NULL,
      "role" TEXT NOT NULL,
      "passwordHash" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key"
    ON "User"("email")
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Friend" (
      "userId" TEXT NOT NULL,
      "friendId" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY ("userId", "friendId"),
      CONSTRAINT "Friend_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "Friend_friendId_fkey"
        FOREIGN KEY ("friendId") REFERENCES "User" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "FriendRequest" (
      "requesterId" TEXT NOT NULL,
      "recipientId" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY ("requesterId", "recipientId"),
      CONSTRAINT "FriendRequest_requesterId_fkey"
        FOREIGN KEY ("requesterId") REFERENCES "User" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "FriendRequest_recipientId_fkey"
        FOREIGN KEY ("recipientId") REFERENCES "User" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "EventInvite" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "eventId" INTEGER NOT NULL,
      "senderId" TEXT NOT NULL,
      "recipientId" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "EventInvite_eventId_fkey"
        FOREIGN KEY ("eventId") REFERENCES "Event" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "EventInvite_senderId_fkey"
        FOREIGN KEY ("senderId") REFERENCES "User" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "EventInvite_recipientId_fkey"
        FOREIGN KEY ("recipientId") REFERENCES "User" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "EventInvite_eventId_senderId_recipientId_key"
    ON "EventInvite"("eventId", "senderId", "recipientId")
  `);
});

beforeEach(async () => {
  await prisma.comment.deleteMany();
  await prisma.eventRsvp.deleteMany();
  await prisma.eventInvite.deleteMany();
  await prisma.event.deleteMany();
  await prisma.friendRequest.deleteMany();
  await prisma.friend.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});
