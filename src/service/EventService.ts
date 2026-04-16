import { Err, Ok, type Result } from "../lib/result";
import { IEvent, IEventRepository, CreateEventInput, EventStatus} from "../repository/EventRepository";
import { type EventError, UnexpectedRepositoryError, ValidationError, EventNotFound} from "../repository/Errors";
import { InvalidId } from "./errors";

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
  getEditableEvent(eventId: number, actingUserId: string): Promise<Result<IEvent, EventError>>;
  updateEvent(eventId: number, actingUserId: string, input: CreateEventServiceInput): Promise<Result<IEvent, EventError>>;
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

  private validateEventInput(input: CreateEventServiceInput): Result<void, EventError> {
    if (input.title.trim().length === 0) {
      return Err(ValidationError("Title is required."));
    }

    if (input.description.trim().length === 0) {
      return Err(ValidationError("Description is required."));
    }

    if (input.location.trim().length === 0) {
      return Err(ValidationError("Location is required."));
    }

    if (input.category.trim().length === 0) {
      return Err(ValidationError("Category is required."));
    }

    if (Number.isNaN(input.startDatetime.getTime())) {
      return Err(ValidationError("Start date/time is invalid."));
    }

    if (Number.isNaN(input.endDatetime.getTime())) {
      return Err(ValidationError("End date/time is invalid."));
    }

    if (input.endDatetime <= input.startDatetime) {
      return Err({
        name: "ValidationError",
        message: "End date/time must be after start date/time.",
      });
    }

    if (input.capacity !== null && input.capacity < 1) {
      return Err({
        name: "ValidationError",
        message: "Capacity must be positive when provided.",
      });
    }

    return Ok(undefined);
  }

  async getEditableEvent(eventId: number, actingUserId: string): Promise<Result<IEvent, EventError>> {
    if (!Number.isInteger(eventId) || eventId <= 0) {
      return Err(InvalidId("ID must be a positive integer."));
    }

    const eventResult = await this.repo.getEventById(eventId);
    if (!eventResult.ok) {
      return eventResult;
    }

    const event = eventResult.value;

    return Ok(event);
  }

  async updateEvent(eventId: number, actingUserId: string, input: CreateEventServiceInput): Promise<Result<IEvent, EventError>> {
    const editableEventResult = await this.getEditableEvent(eventId, actingUserId);
    if (!editableEventResult.ok) {
      return editableEventResult;
    }

    const validationResult = this.validateEventInput(input);
    if (!validationResult.ok) {
      return validationResult;
    }

    return await this.repo.updateEvent(eventId, input);
  }

}

export function CreateEventService(repo: IEventRepository): IEventService {
  return new EventService(repo);
}