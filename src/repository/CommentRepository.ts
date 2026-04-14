import { type Result } from "../lib/result";

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