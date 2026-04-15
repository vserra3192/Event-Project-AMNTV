import { Err, Ok, type Result } from "../lib/result";

export interface IComment {
  id: number;
  eventId: number;
  userId: string;
  content: string;
  createdAt: Date;
}

export type CommentError =
  | { name: "CommentNotFound"; message: string }
  | { name: "InvalidContent"; message: string };

export const CommentNotFound = (message: string): CommentError => ({
  name: "CommentNotFound",
  message,
});

export const InvalidContent = (message: string): CommentError => ({
  name: "InvalidContent",
  message,
});

export interface ICommentRepository {
  createComment(comment: IComment): Promise<Result<IComment, CommentError>>;
  deleteComment(id: number): Promise<Result<void, CommentError>>;
  getCommentById(id: number): Promise<Result<IComment, CommentError>>;
  getCommentsByEventId(eventId: number): Promise<Result<IComment[], CommentError>>;
}

export class InMemoryCommentRepository implements ICommentRepository {
  private store: IComment[] = [];
  private nextId = 1;

  async getCommentsByEventId(eventId: number): Promise<Result<IComment[], CommentError>> {
    const comments = this.store
      .filter(c => c.eventId === eventId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    return Ok(comments.map(c => ({ ...c })));
  }
}