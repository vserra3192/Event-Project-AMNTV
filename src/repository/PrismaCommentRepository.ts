import { PrismaClient } from "@prisma/client";
import { Err, Ok, type Result } from "../lib/result";
import { CommentError, CommentNotFound, IComment, ICommentRepository } from "./InMemoryCommentRepository";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

export class PrismaCommentRepository implements ICommentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getCommentsByEventId(eventId: number): Promise<Result<IComment[], CommentError>> {
    try {
      const comments = await this.prisma.comment.findMany({
        where: { eventId },
        orderBy: { createdAt: "asc" },
      });

      return Ok(comments);
    } catch {
      return Err(CommentNotFound("Failed to fetch comments."));
    }
  }

  async getCommentById(id: number): Promise<Result<IComment, CommentError>> {
    try {
      const comment = await this.prisma.comment.findUnique({
        where: { id },
      });

      if (!comment) {
        return Err(CommentNotFound(`Comment ${id} not found.`));
      }

      return Ok(comment);
    } catch {
      return Err(CommentNotFound("Failed to fetch comment."));
    }
  }

  async createComment(input: Omit<IComment, "id" | "createdAt">): Promise<Result<IComment, CommentError>> {
    try {
      const comment = await this.prisma.comment.create({
        data: {
          eventId: input.eventId,
          userId: input.userId,
          content: input.content,
        },
      });

      return Ok(comment);
    } catch {
      return Err(CommentNotFound("Failed to create comment."));
    }
  }
  
  async deleteComment(id: number): Promise<Result<void, CommentError>> {
    try {
      const existing = await this.prisma.comment.findUnique({
        where: { id },
      });

      if (!existing) {
        return Err(CommentNotFound(`Comment ${id} not found.`));
      }

      await this.prisma.comment.delete({
        where: { id },
      });

      return Ok(undefined);
    } catch {
      return Err(CommentNotFound("Failed to delete comment."));
    }
  }
}

export function CreatePrismaCommentRepository(prisma?: PrismaClient): ICommentRepository {
  if (prisma != null) {
    return new PrismaCommentRepository(prisma);
  }

  const databaseUrl = process.env.DATABASE_URL ?? 'file:./prisma/dev.db';
  const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
  return new PrismaCommentRepository(new PrismaClient({ adapter }));
}