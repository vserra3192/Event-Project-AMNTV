import { PrismaClient } from "@prisma/client";

export class PrismaCommentRepository implements ICommentRepository {
  constructor(private readonly prisma: PrismaClient) {}
}