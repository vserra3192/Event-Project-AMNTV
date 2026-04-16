import { Ok, Err, type Result } from '../lib/result';
import type { UserRole } from '../auth/User';
import {CommentError, IComment, ICommentRepository, CommentNotFound, InvalidContent} from '../repository/CommentRepository';

export type User = {
  userId: string;
  displayName: string;
  role: UserRole;
};

export type CommentServiceError =
  | CommentError
  | { name: 'Forbidden'; message: string };

export const Forbidden = (message: string): CommentServiceError => ({
  name: 'Forbidden',
  message,
});

export interface ICommentService {
  getCommentsByEventId(eventId: number): Promise<Result<IComment[], CommentServiceError>>;
  addComment(eventId: number, content: string, actor: User): Promise<Result<IComment, CommentServiceError>>;
  deleteComment(commentId: number, actor: User): Promise<Result<void, CommentServiceError>>;
}

export class CommentService implements ICommentService {
  constructor(private readonly repo: ICommentRepository) {}

  async getCommentsByEventId(eventId: number): Promise<Result<IComment[], CommentServiceError>> {
    if (!Number.isInteger(eventId) || eventId <= 0) {
      return Err(InvalidContent("Invalid event ID."));
    }

    const result = await this.repo.getCommentsByEventId(eventId);

    if (!result.ok) {
      return Err(result.value);
    }

    return Ok(result.value);
  }

  async addComment(eventId: number, content: string, actor: User): Promise<Result<IComment, CommentServiceError>> {
    if (!Number.isInteger(eventId) || eventId <= 0) {
      return Err(InvalidContent("Invalid event ID."));
    }

    if (!content || content.trim().length === 0) {
      return Err(InvalidContent("Content cannot be empty."));
    }

    const result = await this.repo.createComment({eventId, userId: actor.userId, content: content.trim()});

    if (!result.ok) {
      return Err(result.value);
    }

    return Ok(result.value);
  }

  async deleteComment(commentId: number, actor: User): Promise<Result<void, CommentServiceError>> {
    if (!Number.isInteger(commentId) || commentId <= 0) {
      return Err(InvalidContent("Invalid comment ID."));
    }

    const commentResult = await this.repo.getCommentById(commentId);

    if (!commentResult.ok) {
      return Err(commentResult.value);
    }

    const comment = commentResult.value;

    const isAuthor = comment.userId === actor.userId;
    const isAdmin = actor.role === "admin";

    if (!isAuthor && !isAdmin) {
      return Err(Forbidden("You are not allowed to delete this comment."));
    }

    const deleteResult = await this.repo.deleteComment(commentId);

    if (!deleteResult.ok) {
      return Err(deleteResult.value);
    }

    return Ok(undefined);
  }
}