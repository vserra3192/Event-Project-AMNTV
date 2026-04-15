import { Ok, Err, type Result } from '../lib/result';
import type { UserRole } from '../auth/User';
import {CommentError, IComment, ICommentRepository, CommentNotFound, InvalidContent} from '../repository/CommentRepository';

export type User = {
  userId: string;
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

  async getCommentsByEventId(
    eventId: number
  ): Promise<Result<IComment[], CommentServiceError>> {
    if (!Number.isInteger(eventId) || eventId <= 0) {
      return Err(CommentNotFound("Invalid Id"));
    }

    const result = await this.repo.getCommentsByEventId(eventId);

    if (!result.ok) {
      return Err(result.value);
    }

    return Ok(result.value);
  }


}