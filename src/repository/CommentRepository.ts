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

 // in-memory repo implementation

export class InMemoryCommentRepository implements ICommentRepository {
  private store: IComment[] = [];
  private nextId = 1;

  async getCommentsByEventId(eventId: number): Promise<Result<IComment[], CommentError>> {
    const comments = this.store
      .filter(c => c.eventId === eventId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    return Ok(comments.map(c => ({ ...c })));
  }

  async getCommentById(id: number): Promise<Result<IComment, CommentError>> {
    const comment = this.store.find(c => c.id === id);
    if (!comment) return Err(CommentNotFound(`Comment ${id} not found.`));
    return Ok({ ...comment });
  }

  async createComment(input: Omit<IComment, "id" | "createdAt">): Promise<Result<IComment, CommentError>> {
    const comment: IComment = {...input, id: this.nextId++, createdAt: new Date(),};

    this.store.push(comment);
    return Ok({ ...comment });
  }
  
  async deleteComment(id: number): Promise<Result<void, CommentError>> {
    const idx = this.store.findIndex(c => c.id === id);
    if (idx === -1) return Err(CommentNotFound(`Comment ${id} not found.`));

    this.store.splice(idx, 1);
    return Ok(undefined);
  }
}