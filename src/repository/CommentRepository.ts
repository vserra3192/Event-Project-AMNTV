export interface IComment {
  id: number;
  eventId: number;
  userId: string;
  content: string;
  createdAt: Date;
}