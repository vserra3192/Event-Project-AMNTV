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