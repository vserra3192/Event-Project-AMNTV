import { Prisma, PrismaClient, type User as PrismaUser } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { Err, Ok, type Result } from "../lib/result";
import { UnexpectedDependencyError, type AuthError } from "./errors";
import { DEMO_USERS } from "./InMemoryUserRepository";
import type { IUserRecord, UserRole } from "./User";
import type { IUserRepository } from "./UserRepository";

type UserWithFriendState = PrismaUser & {
  freindsList?: Array<{ friendId: string }>;
  outgoingFriendRequests?: Array<{ recipientId: string }>;
  ingoingFriendRequests?: Array<{ requesterId: string }>;
};

const userFriendStateInclude = {
  freindsList: {
    select: { friendId: true },
    orderBy: { createdAt: "asc" },
  },
  outgoingFriendRequests: {
    select: { recipientId: true },
    orderBy: { createdAt: "asc" },
  },
  ingoingFriendRequests: {
    select: { requesterId: true },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.UserInclude;

class PrismaUserRepository implements IUserRepository {
  private demoUsersReady: Promise<void> | null = null;

  constructor(private readonly prisma: PrismaClient) {}

  private mapUser(user: UserWithFriendState): IUserRecord {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role as UserRole,
      passwordHash: user.passwordHash,
      freindsList: user.freindsList?.map((friend) => friend.friendId) ?? [],
      outgoingFriendRequests:
        user.outgoingFriendRequests?.map((request) => request.recipientId) ?? [],
      ingoingFriendRequests:
        user.ingoingFriendRequests?.map((request) => request.requesterId) ?? [],
    };
  }

  private async ensureDemoUsers(): Promise<void> {
    if (this.demoUsersReady === null) {
      this.demoUsersReady = this.seedDemoUsersIfEmpty();
    }

    await this.demoUsersReady;
  }

  private async seedDemoUsersIfEmpty(): Promise<void> {
    const userCount = await this.prisma.user.count();
    if (userCount > 0) {
      return;
    }

    await this.prisma.user.createMany({
      data: DEMO_USERS.map((user) => ({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        passwordHash: user.passwordHash,
      })),
    });
  }

  async findByEmail(email: string): Promise<Result<IUserRecord | null, AuthError>> {
    try {
      await this.ensureDemoUsers();
      const match = await this.prisma.user.findUnique({
        where: { email },
        include: userFriendStateInclude,
      });

      return Ok(match ? this.mapUser(match) : null);
    } catch {
      return Err(UnexpectedDependencyError("Unable to read the demo users."));
    }
  }

  async findById(id: string): Promise<Result<IUserRecord | null, AuthError>> {
    try {
      await this.ensureDemoUsers();
      const match = await this.prisma.user.findUnique({
        where: { id },
        include: userFriendStateInclude,
      });

      return Ok(match ? this.mapUser(match) : null);
    } catch {
      return Err(UnexpectedDependencyError("Unable to read the demo users."));
    }
  }

  async listUsers(): Promise<Result<IUserRecord[], AuthError>> {
    try {
      await this.ensureDemoUsers();
      const users = await this.prisma.user.findMany({
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: userFriendStateInclude,
      });

      return Ok(users.map((user) => this.mapUser(user)));
    } catch {
      return Err(UnexpectedDependencyError("Unable to list users."));
    }
  }

  async createUser(user: IUserRecord): Promise<Result<IUserRecord, AuthError>> {
    try {
      await this.ensureDemoUsers();
      const created = await this.prisma.user.create({
        data: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          passwordHash: user.passwordHash,
        },
        include: userFriendStateInclude,
      });

      return Ok(this.mapUser(created));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return Err(UnexpectedDependencyError("Unable to create the user."));
      }

      return Err(UnexpectedDependencyError("Unable to create the user."));
    }
  }

  async deleteUser(id: string): Promise<Result<boolean, AuthError>> {
    try {
      await this.ensureDemoUsers();
      const result = await this.prisma.user.deleteMany({
        where: { id },
      });

      return Ok(result.count > 0);
    } catch {
      return Err(UnexpectedDependencyError("Unable to delete the user."));
    }
  }

  async sendFriendRequest(fromUserId: string, toUserId: string): Promise<Result<boolean, AuthError>> {
    try {
      await this.ensureDemoUsers();
      if (fromUserId === toUserId) {
        return Ok(false);
      }

      const [sender, receiver, existingFriend, reverseRequest] = await Promise.all([
        this.prisma.user.findUnique({ where: { id: fromUserId }, select: { id: true } }),
        this.prisma.user.findUnique({ where: { id: toUserId }, select: { id: true } }),
        this.prisma.friend.findUnique({
          where: { userId_friendId: { userId: fromUserId, friendId: toUserId } },
        }),
        this.prisma.friendRequest.findUnique({
          where: { requesterId_recipientId: { requesterId: toUserId, recipientId: fromUserId } },
        }),
      ]);

      if (!sender || !receiver || existingFriend) {
        return Ok(false);
      }

      if (reverseRequest) {
        return this.acceptFriendRequest(fromUserId, toUserId);
      }

      await this.prisma.friendRequest.upsert({
        where: {
          requesterId_recipientId: {
            requesterId: fromUserId,
            recipientId: toUserId,
          },
        },
        update: {},
        create: {
          requesterId: fromUserId,
          recipientId: toUserId,
        },
      });

      return Ok(true);
    } catch {
      return Err(UnexpectedDependencyError("Unable to send friend request."));
    }
  }

  async acceptFriendRequest(userId: string, requesterId: string): Promise<Result<boolean, AuthError>> {
    try {
      await this.ensureDemoUsers();
      const request = await this.prisma.friendRequest.findUnique({
        where: {
          requesterId_recipientId: {
            requesterId,
            recipientId: userId,
          },
        },
      });

      if (!request) {
        return Ok(false);
      }

      await this.prisma.$transaction([
        this.prisma.friendRequest.delete({
          where: {
            requesterId_recipientId: {
              requesterId,
              recipientId: userId,
            },
          },
        }),
        this.prisma.friend.upsert({
          where: { userId_friendId: { userId, friendId: requesterId } },
          update: {},
          create: { userId, friendId: requesterId },
        }),
        this.prisma.friend.upsert({
          where: { userId_friendId: { userId: requesterId, friendId: userId } },
          update: {},
          create: { userId: requesterId, friendId: userId },
        }),
      ]);

      return Ok(true);
    } catch {
      return Err(UnexpectedDependencyError("Unable to accept friend request."));
    }
  }

  async declineFriendRequest(userId: string, requesterId: string): Promise<Result<boolean, AuthError>> {
    try {
      await this.ensureDemoUsers();
      const result = await this.prisma.friendRequest.deleteMany({
        where: {
          requesterId,
          recipientId: userId,
        },
      });

      return Ok(result.count > 0);
    } catch {
      return Err(UnexpectedDependencyError("Unable to decline friend request."));
    }
  }

  async getFriendList(userId: string): Promise<Result<IUserRecord[], AuthError>> {
    try {
      await this.ensureDemoUsers();
      const friends = await this.prisma.friend.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        include: {
          friend: {
            include: userFriendStateInclude,
          },
        },
      });

      return Ok(friends.map((friend) => this.mapUser(friend.friend)));
    } catch {
      return Err(UnexpectedDependencyError("Unable to list friends."));
    }
  }

  async removeFriend(userId: string, friendId: string): Promise<Result<boolean, AuthError>> {
    try {
      await this.ensureDemoUsers();
      const result = await this.prisma.friend.deleteMany({
        where: {
          OR: [
            { userId, friendId },
            { userId: friendId, friendId: userId },
          ],
        },
      });

      return Ok(result.count > 0);
    } catch {
      return Err(UnexpectedDependencyError("Unable to remove friend."));
    }
  }
}

export function CreatePrismaUserRepository(prisma?: PrismaClient): IUserRepository {
  if (prisma != null) {
    return new PrismaUserRepository(prisma);
  }

  const databaseUrl = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
  return new PrismaUserRepository(new PrismaClient({ adapter }));
}
