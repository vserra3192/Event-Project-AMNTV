import { Err, Ok, type Result } from "../lib/result";
import { IEvent, IEventRepository, CreateEventInput, EventStatus} from "../repository/EventRepository";
import { type EventError, UnexpectedRepositoryError, ValidationError} from "../repository/Errors";

export interface CreateEventServiceInput {
  title: string;
  description: string;
  location: string;
  category: string;
  status: EventStatus;
  capacity: number | null;
  startDatetime: Date;
  endDatetime: Date;
}

export interface IEventService {
  getEventByID(id: number): Promise<Result<IEvent, EventError>>;
  getAllEvents(): Promise<Result<IEvent[], EventError>>;
}

export interface IEventService {
  createEvent(input: CreateEventServiceInput, organizerId: string): Promise<Result<IEvent, EventError>>;
  getAllEvents(): Promise<Result<IEvent[], EventError>>;
}