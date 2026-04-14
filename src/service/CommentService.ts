import type { UserRole } from '../auth/User';
import type { Result } from '../lib/result';
import type { CommentError, IComment } from '../repository/CommentRepository';

export type User = {
  userId: String;
  displayName: String;
  role: UserRole;
};

export interface ICommentService {
  getCommentsByEventId(eventId: number): Promise<Result<IComment[], CommentServiceError>>;
  addComment(eventId: number, content: string, actor: User): Promise<Result<IComment, CommentServiceError>>;
  deleteComment(commentId: number, actor: User): Promise<Result<void, CommentServiceError>>;
}