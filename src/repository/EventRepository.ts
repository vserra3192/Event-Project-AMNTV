import type {Result} from '../lib/result';

export interface IEvent {
  id: number;
  title: string;
  category: string;
  startTime: Date;
  endTime: Date;
  rsvpStatus: boolean;
}

export type EventError =
  | { name: "EventNotFound"; message: string }
  | { name: "InvalidID"; message: string };

export const EventNotFound = (message: string): EventError => ({
  name: "EventNotFound",
  message,
});

export const InvalidID = (message: string): EventError => ({
  name: "InvalidID",
  message,
});

export type CreateEvent = {
  title: string;
  category: string;
  startTime: Date;
  endTime: Date;
};

export interface IEventRepository {
  getEventById(id: number): Promise<Result<IEvent, EventError>>;
  getAllEvents(): Promise<Result<IEvent[], EventError>>;
  updateEventTitle(id: number, title: string): Promise<Result<IEvent, EventError>>;
}



/*Event{
  id Int  @id @default(autoincrement())
  title String
  category String
  startTime DateTime
  endTime DateTime
  rsvpStatus Boolean @default(false)
}*/