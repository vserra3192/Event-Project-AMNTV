import { Err, Ok, type Result } from "../lib/result";
import type { IEvent, EventError, IEventRepository } from "../repository/EventRepository";
import { InvalidID } from "../repository/EventRepository";

export interface IEventService {
  getEventByID(id: number): Promise<Result<IEvent, EventError>>;
  getAllEvents(): Promise<Result<IEvent[], EventError>>;
}

export class EventService implements IEventService {
  constructor(private readonly eventRepository: IEventRepository) {}

  async getEventByID(id: number): Promise<Result<IEvent, EventError>> {
    if (!Number.isInteger(id) || id <= 0) {
      return Err(InvalidID("ID must be a positive integer."));
    }
    return await this.eventRepository.getEventById(id);
  }

  async getAllEvents(): Promise<Result<IEvent[], EventError>> {
    return await this.eventRepository.getAllEvents();
  }
}