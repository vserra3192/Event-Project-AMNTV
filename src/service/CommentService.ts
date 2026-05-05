import { Ok, Err, type Result } from '../lib/result';
import type { UserRole } from '../auth/User';
import {CommentError, IComment, ICommentRepository, CommentNotFound, InvalidContent} from '../repository/InMemoryCommentRepository';
import type { IEventRepository } from "../repository/InMemoryEventRepository";

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

export const InvalidId = (message: string) => ({
  name: "InvalidId",
  message,
});


export interface ICommentService {
  getCommentsByEventId(eventId: number): Promise<Result<IComment[], CommentServiceError>>;
  addComment(eventId: number, content: string, actor: User): Promise<Result<IComment, CommentServiceError>>;
  deleteComment(commentId: number, actor: User): Promise<Result<void, CommentServiceError>>;
}

function isCommentError(x: unknown): x is CommentError {
  return typeof x === "object" && x !== null && "name" in x && "message" in x;
}

export class CommentService implements ICommentService {
  constructor(
    private readonly repo: ICommentRepository,
    private readonly eventRepo: IEventRepository,
  ) {}

  private async ensureCommentsAvailable(eventId: number): Promise<Result<void, CommentServiceError>> {
    const eventResult = await this.eventRepo.getEventById(eventId);
    if (!eventResult.ok) {
      if (!isCommentError(eventResult.value)) {
        return Err(InvalidContent("Unknown repository error"));
      }
      return Err(eventResult.value);
    }

    if (eventResult.value.status !== "past") {
      return Err(Forbidden("Comments are only available on past events."));
    }

    return Ok(undefined);
  }

  async getCommentsByEventId(eventId: number): Promise<Result<IComment[], CommentServiceError>> {
    if (!Number.isInteger(eventId) || eventId <= 0) {
      return Err(InvalidContent("Invalid event ID."));
    }

    const available = await this.ensureCommentsAvailable(eventId);
    if (available.ok === false) {
      return Err(available.value);
    }

    const result = await this.repo.getCommentsByEventId(eventId);

    if (!result.ok) {
      if (isCommentError(result.value)) {
        return Err(result.value);
      }
      return Err(InvalidContent("Unknown repository error"));
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

    const available = await this.ensureCommentsAvailable(eventId);
    if (available.ok === false) {
      return Err(available.value);
    }

    const result = await this.repo.createComment({eventId, userId: actor.userId, content: content.trim()});

    if (!result.ok) {
      if (isCommentError(result.value)) {
        return Err(result.value);
      }
      return Err(InvalidContent("Unknown repository error"));
    }

    return Ok(result.value);
  }

  async deleteComment(commentId: number, actor: User): Promise<Result<void, CommentServiceError>> {
    if (!Number.isInteger(commentId) || commentId <= 0) {
      return Err(InvalidContent("Invalid comment ID."));
    }

    const commentResult = await this.repo.getCommentById(commentId);
    if (!commentResult.ok) {
      if (!isCommentError(commentResult.value)) {
        return Err(InvalidContent("Unknown repository error"));
      }
      return Err(commentResult.value);
    }

    const comment = commentResult.value;

    const eventResult = await this.eventRepo.getEventById(comment.eventId);
    if (!eventResult.ok) {
      if (!isCommentError(eventResult.value)) {
        return Err(InvalidContent("Unknown repository error"));
      }
      return Err(eventResult.value);
    }

    const event = eventResult.value;
    if (event.status !== "past") {
      return Err(Forbidden("Comments are only available on past events."));
    }

    const isAuthor = comment.userId === actor.userId;
    const isAdmin = actor.role === "admin";
    const isOrganizer = event.organizerId === actor.userId;

    if (!isAuthor && !isAdmin && !isOrganizer) {
      return Err(Forbidden("You are not allowed to delete this comment."));
    }

    const deleteResult = await this.repo.deleteComment(commentId);

    if (!deleteResult.ok) {
      if (!isCommentError(deleteResult.value)) {
        return Err(InvalidContent("Unknown repository error"));
      }
      return Err(deleteResult.value);
    }

    return Ok(undefined);
  }
}
