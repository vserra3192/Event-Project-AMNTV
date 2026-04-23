import { PrismaClient } from "@prisma/client";
import { Err, Ok, type Result } from "../lib/result";
import { CommentError, CommentNotFound, IComment, ICommentRepository } from "./InMemoryCommentRepository";

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

  async createComment(
    input: Omit<IComment, "id" | "createdAt">
  ): Promise<Result<IComment, CommentError>> {
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
}