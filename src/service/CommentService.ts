import type { UserRole } from '../auth/User';
import type { Result } from '../lib/result';
import type { CommentError, IComment } from '../repository/CommentRepository';

export type User = {
  userId: String;
  displayName: String;
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