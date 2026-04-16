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
  getEditableEvent(eventId: number, actingUserId: string, actingUserRole: string): Promise<Result<IEvent, EventError>>;
  updateEvent(eventId: number, actingUserId: string, actingUserRole: string, input: CreateEventServiceInput): Promise<Result<IEvent, EventError>>;
  publishEvent(eventId: number, actingUserId: string, actingUserRole: string): Promise<Result<IEvent, EventError>>;
  cancelEvent(eventId: number, actingUserId: string, actingUserRole: string): Promise<Result<IEvent, EventError>>;
  archiveExpiredEvents(): Promise<Result<number, EventError>>;
  getActiveEvents(): Promise<Result<IEvent[], EventError>>;
  getPastEvents(): Promise<Result<IEvent[], EventError>>;
  getEventsBySearch(query: string): Promise<Result<IEvent[], EventError>>;
}

class EventService implements IEventService {
  constructor(private readonly repo: IEventRepository) {}

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
      return Err(ValidationError("End date/time must be after start date/time."));
    }

    if (
      input.capacity !== null &&
      (!Number.isInteger(input.capacity) || input.capacity < 1)
    ) {
      return Err(ValidationError("Capacity must be a positive integer when provided."));
    }

    return Ok(undefined);
  }
 
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
    const userEvents = await this.repo.getEventsByOrganizerId(userId);
    if (userEvents.ok === false) {
      return Err(UnexpectedRepositoryError(userEvents.value.message));
    }
    return Ok(userEvents.value);
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


  async getEditableEvent(eventId: number, actingUserId: string, actingUserRole: string): Promise<Result<IEvent, EventError>> {
    if (!Number.isInteger(eventId) || eventId < 1) {
      return Err(InvalidId("ID must be a positive integer."));
    }

    if (actingUserId.trim().length === 0) {
      return Err(ValidationError("You must be logged in to edit an event."));
    }

    const eventResult = await this.repo.getEventById(eventId);
    if (!eventResult.ok) {
      return eventResult;
    }

    const event = eventResult.value;
    const isAdmin = actingUserRole === "admin";
    const isOwner = event.organizerId === actingUserId;

    if (!isAdmin && !isOwner) {
      return Err(ValidationError("You do not have permission to edit this event."));
    }

    const hasConcluded = event.status === "past" || event.endDatetime <= new Date();
    if (event.status === "cancelled" || hasConcluded) {
      return Err(
        ValidationError("Cancelled or concluded events cannot be edited."),
      );
    }

    return Ok(event);
  }

  async updateEvent(eventId: number, actingUserId: string, actingUserRole: string, input: CreateEventServiceInput): Promise<Result<IEvent, EventError>> {
    const editableEventResult = await this.getEditableEvent(
      eventId,
      actingUserId,
      actingUserRole,
    );
    if (!editableEventResult.ok) {
      return editableEventResult;
    }

    const validationResult = this.validateEventInput(input);
    if (validationResult.ok === false) {
      return Err(validationResult.value);
    }

    return this.repo.updateEvent(eventId, {
      title: input.title.trim(),
      description: input.description.trim(),
      location: input.location.trim(),
      category: input.category.trim(),
      status: input.status,
      capacity: input.capacity,
      startDatetime: input.startDatetime,
      endDatetime: input.endDatetime,
    });
  }
  async publishEvent(eventId: number, actingUserId: string, actingUserRole: string): Promise<Result<IEvent, EventError>> {
    if (!Number.isInteger(eventId) || eventId < 1) {
      return Err(InvalidId("ID must be a positive integer."));
    }

    const eventResult = await this.repo.getEventById(eventId);
    if (eventResult.ok === false) {
      return eventResult;
    }

    const event = eventResult.value;
    const isStaffOwner = actingUserRole === "staff" && event.organizerId === actingUserId;

    if (!isStaffOwner) {
      return Err(ValidationError("Only the event organizer can publish this event."));
    }

    if (event.status !== "draft") {
      return Err(ValidationError("Only draft events can be published."));
    }

    return this.repo.updateEventStatus(eventId, "published");
  }

  async getEventsBySearch(query: string): Promise<Result<IEvent[], EventError>> {
    if (query.trim().length === 0) {
      return Err(ValidationError("Search query cannot be empty."));
    }

    return this.repo.getEventBySearch(query);
  }

  async cancelEvent(eventId: number, actingUserId: string, actingUserRole: string): Promise<Result<IEvent, EventError>> {
    if (!Number.isInteger(eventId) || eventId < 1) {
      return Err(InvalidId("ID must be a positive integer."));
    }

    const eventResult = await this.repo.getEventById(eventId);
    if (eventResult.ok === false) {
      return eventResult;
    }

    const event = eventResult.value;
    const isAdmin = actingUserRole === "admin";
    const isStaffOwner = actingUserRole === "staff" && event.organizerId === actingUserId;

    if (!isAdmin && !isStaffOwner) {
      return Err(ValidationError("Invalid Permission."));
    }

    if (event.status !== "published") {
      return Err(ValidationError("Only published events can be cancelled."));
    }

    return this.repo.updateEventStatus(eventId, "cancelled");
  }

  async archiveExpiredEvents(): Promise<Result<number, EventError>> {
    const now = new Date();

    const result = await this.repo.getAllEvents();
    if (result.ok === false) {
      return Err(UnexpectedRepositoryError(result.value.message));
    }

    let count = 0;

    for (const event of result.value) {
      const isExpired =
        event.status !== "past" &&
        event.endDatetime < now;

      if (!isExpired) continue;

      const updateResult = await this.repo.updateEventStatus(
        event.id,
        "past"
      );

      if (updateResult.ok) {
        count++;
      }
    }

    return Ok(count);
  }

  async getActiveEvents(): Promise<Result<IEvent[], EventError>> {
    const result = await this.repo.getAllEvents();
    if (result.ok === false) {
      return Err(UnexpectedRepositoryError(result.value.message));
    }

    return Ok(
      result.value.filter(e => e.status !== "past")
    );
  }

  async getPastEvents(): Promise<Result<IEvent[], EventError>> {
    const result = await this.repo.getAllEvents();
    if (result.ok === false) {
      return Err(UnexpectedRepositoryError(result.value.message));
    }

    return Ok(
      result.value
        .filter(e => e.status === "past")
        .sort((a, b) =>
          b.endDatetime.getTime() - a.endDatetime.getTime()
        )
    );
  }
}

export function CreateEventService(repo: IEventRepository): IEventService {
  return new EventService(repo);
}