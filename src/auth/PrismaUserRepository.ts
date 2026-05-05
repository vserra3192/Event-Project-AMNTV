import { Prisma, PrismaClient, type User as PrismaUser } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { Err, Ok, type Result } from "../lib/result";
import { UnexpectedDependencyError, type AuthError } from "./errors";
import { DEMO_USERS } from "./InMemoryUserRepository";
import type { IUserRecord, UserRole } from "./User";
import type { IUserRepository } from "./UserRepository";

class PrismaUserRepository implements IUserRepository {
  private demoUsersReady: Promise<void> | null = null;

  constructor(private readonly prisma: PrismaClient) {}

  private mapUser(user: PrismaUser): IUserRecord {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role as UserRole,
      passwordHash: user.passwordHash,
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
}

export function CreatePrismaUserRepository(prisma?: PrismaClient): IUserRepository {
  if (prisma != null) {
    return new PrismaUserRepository(prisma);
  }

  const databaseUrl = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
  return new PrismaUserRepository(new PrismaClient({ adapter }));
}
