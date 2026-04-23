import { PrismaClient } from "@prisma/client";
import { Err, Ok, type Result } from "../lib/result";
import { CommentError, CommentNotFound, IComment, ICommentRepository } from "./InMemoryCommentRepository";

export class PrismaCommentRepository implements ICommentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getCommentsByEventId(
    eventId: number
  ): Promise<Result<IComment[], CommentError>> {
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
}