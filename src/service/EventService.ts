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
  createEvent(input: CreateEventServiceInput, organizerId: string): Promise<Result<IEvent, EventError>>;
  getAllEvents(): Promise<Result<IEvent[], EventError>>;
  getEventByID(id: number): Promise<Result<IEvent, EventError>>;
  getUserEvents(userId: string): Promise<Result<IEvent[], EventError>>;
}

class EventService implements IEventService {
  constructor(private readonly repo: IEventRepository) {}
 
  async createEvent(
    input: CreateEventServiceInput,
    organizerId: string,
  ): Promise<Result<IEvent, EventError>> {
    if (!input.title.trim()) {
      return Err(ValidationError('Title is required.'));
    }
 
    // Validate category
    if (!input.category.trim()) {
      return Err(ValidationError('Category is required.'));
    }
 
    // Validate location
    if (!input.location.trim()) {
      return Err(ValidationError('Location is required.'));
    }
 
    // Validate times
    if (input.endDatetime <= input.startDatetime) {
      return Err(ValidationError('End time must be after start time.'));
    }
 
    // Validate capacity if provided
    if (input.capacity !== null && (!Number.isInteger(input.capacity) || input.capacity < 1)) {
      return Err(ValidationError('Capacity must be a positive integer.'));
    }
 
    // Validate organizerId was actually passed in (controller's responsibility, but belt-and-suspenders)
    if (!organizerId.trim()) {
      return Err(ValidationError('Organizer identity is required.'));
    }
 
    const repoInput: CreateEventInput = {
      title: input.title.trim(),
      description: input.description.trim(),
      location: input.location.trim(),
      category: input.category.trim(),
      status: input.status,
      capacity: input.capacity,
      startDatetime: input.startDatetime,
      endDatetime: input.endDatetime,
      organizerId,
    };
 
    const result = await this.repo.createEvent(repoInput);
    if (result.ok === false) {
      return Err(UnexpectedRepositoryError(result.value.message));
    }
 
    return Ok(result.value);
  }
 
  async getAllEvents(): Promise<Result<IEvent[], EventError>> {
    const result = await this.repo.getAllEvents();
    if (result.ok === false) {
      return Err(UnexpectedRepositoryError(result.value.message));
    }
    return Ok(result.value);
  }

  async getUserEvents(userId: string): Promise<Result<IEvent[], EventError>> {
    const allEventsResult = await this.repo.getAllEvents();
    if (allEventsResult.ok === false) {
      return Err(UnexpectedRepositoryError(allEventsResult.value.message));
    }
    const userEvents = allEventsResult.value.filter(event => event.organizerId === userId);
    return Ok(userEvents);
  }

  async getEventByID(id: number): Promise<Result<IEvent, EventError>> {
    if (!Number.isInteger(id) || id < 1) {
      return Err(ValidationError('Invalid event ID.'));
    }
    const result = await this.repo.getEventById(id);
    if (result.ok === false) {
      return Err(UnexpectedRepositoryError(result.value.message));
    }
    return Ok(result.value);
  }
}

export function CreateEventService(repo: IEventRepository): IEventService {
  return new EventService(repo);
}