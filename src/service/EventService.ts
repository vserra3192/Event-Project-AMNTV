import { Err, Ok, type Result } from "../lib/result";
import { IEvent, IEventRepository, CreateEventInput, EventStatus, EventRsvpPolicy} from "../repository/InMemoryEventRepository";
import { type EventError, UnexpectedRepositoryError, ValidationError, InvalidEventState, EventNotFound, InvalidId, InvalidSearchInput, UnautherizedError} from "../repository/Errors";
import type { IUserRepository } from "../auth/UserRepository";

export interface CreateEventServiceInput {
  title: string;
  description: string;
  location: string;
  category: string;
  emoji: string | null;
  status: EventStatus;
  rsvpPolicy?: EventRsvpPolicy;
  capacity: number | null;
  startDatetime: Date;
  endDatetime: Date;
}

export interface IEventService {
  createEvent(input: CreateEventServiceInput, organizerId: string): Promise<Result<IEvent, EventError>>;
  getAllEvents(): Promise<Result<IEvent[], EventError>>;
  getEventByID(id: number): Promise<Result<IEvent, EventError>>;
  getUserEvents(userId: string): Promise<Result<IEvent[], EventError>>;
  getEventsForUser(userId: string, userRole?: string): Promise<Result<IEvent[], EventError>>;
  getActiveUserEvents(userId: string): Promise<Result<IEvent[], EventError>>;
  getPastUserEvents(userId: string): Promise<Result<IEvent[], EventError>>;
  getEditableEvent(eventId: number, actingUserId: string, actingUserRole: string): Promise<Result<IEvent, EventError>>;
  updateEvent(eventId: number, actingUserId: string, actingUserRole: string, input: CreateEventServiceInput): Promise<Result<IEvent, EventError>>;
  publishEvent(eventId: number, actingUserId: string, actingUserRole: string): Promise<Result<IEvent, EventError>>;
  cancelEvent(eventId: number, actingUserId: string, actingUserRole: string): Promise<Result<IEvent, EventError>>;
  archiveExpiredEvents(): Promise<Result<number, EventError>>;
  getActiveEvents(): Promise<Result<IEvent[], EventError>>;
  getActiveEventsForUser(userId: string, userRole: string): Promise<Result<IEvent[], EventError>>;
  getPastEvents(): Promise<Result<IEvent[], EventError>>;
  getEventsBySearch(query: string): Promise<Result<IEvent[], EventError>>;
  getEventsBySearchForUser(query: string, userId: string, userRole: string): Promise<Result<IEvent[], EventError>>;
  rsvpEvent(eventId: number, userId: string, userRole?: string): Promise<Result<IEvent, EventError>>;
  rsvpCancelEvent(eventId: number, userId: string): Promise<Result<IEvent, EventError>>;
  getUsersRSVPedEvents(userId: string): Promise<Result<IEvent[], EventError>>;
  getAllRSVPedUserByEventId(eventId: number): Promise<Result<string[], EventError>>;
}

class EventService implements IEventService {
  private static readonly VALID_EVENT_EMOJIS = new Set([
    "🎉",
    "🎸",
    "🍿",
    "🎂",
    "📚",
    "👾",
    "💒",
    "👻",
    "🍕",
    "🏆",
    "✈️",
  ]);

  constructor(private readonly repo: IEventRepository, private readonly userRepo?: IUserRepository) {}

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

    if (
      input.emoji !== null &&
      !EventService.VALID_EVENT_EMOJIS.has(input.emoji)
    ) {
      return Err(ValidationError("Emoji must be selected from the provided options."));
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

    if (input.rsvpPolicy && !["anyone", "friends-only", "invite-only"].includes(input.rsvpPolicy)) {
      return Err(ValidationError("Who can RSVP? must be anyone, friends-only, or invite-only."));
    }

    return Ok(undefined);
  }

  private async canUserJoinEvent(event: IEvent, userId: string, userRole: string): Promise<boolean> {
    if (event.status !== "published") {
      return false;
    }

    if (event.organizerId === userId || userRole === "admin") {
      return true;
    }

    if (event.rsvpPolicy === "anyone") {
      return true;
    }

    if (!this.userRepo || userId.trim().length === 0) {
      return false;
    }

    const userResult = await this.userRepo.findById(userId);
    if (!userResult.ok || !userResult.value) {
      return false;
    }

    if (event.rsvpPolicy === "friends-only") {
      return userResult.value.freindsList.includes(event.organizerId);
    }

    return userResult.value.incomingEventInvites.some((invite) => invite.eventId === event.id);
  }

  private async filterJoinableEvents(events: IEvent[], userId: string, userRole: string): Promise<IEvent[]> {
    const eligibility = await Promise.all(
      events.map(async (event) => ({
        event,
        canJoin: await this.canUserJoinEvent(event, userId, userRole),
      })),
    );

    return eligibility.filter((entry) => entry.canJoin).map((entry) => entry.event);
  }
 
  async createEvent(
    input: CreateEventServiceInput,
    organizerId: string,
  ): Promise<Result<IEvent, EventError>> {
    const validate = this.validateEventInput(input);
    if (validate.ok === false) {
      return Err(validate.value);
    }
 
    const repoInput: CreateEventInput = {
      title: input.title.trim(),
      description: input.description.trim(),
      location: input.location.trim(),
      category: input.category.trim(),
      emoji: input.emoji,
      status: input.status,
      rsvpPolicy: input.rsvpPolicy ?? "anyone",
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

  async rsvpEvent(eventId: number, userId: string, userRole = ""): Promise<Result<IEvent, EventError>> {
    const eventResult = await this.getEventByID(eventId);
    if (!eventResult.ok) {
      return eventResult;
    }

    const canJoin = await this.canUserJoinEvent(eventResult.value, userId, userRole);
    if (!canJoin) {
      return Err(UnautherizedError("You do not have permission to RSVP for this event."));
    }

    return this.repo.rsvpEvent(eventId, userId);
  }

  async rsvpCancelEvent(eventId: number, userId: string): Promise<Result<IEvent, EventError>> {
    const eventResult = await this.getEventByID(eventId);
    if (!eventResult.ok) {
      return eventResult;
    }

    if (eventResult.value.status !== "published") {
      return Err(InvalidEventState("RSVPs are only available for published events."));
    }

    return this.repo.rsvpCancelEvent(eventId, userId);
  }


  async getUserEvents(userId: string): Promise<Result<IEvent[], EventError>> {
    const userEvents = await this.repo.getEventsByOrganizerId(userId);
    if (userEvents.ok === false) {
      return Err(UnexpectedRepositoryError(userEvents.value.message));
    }
    return Ok(userEvents.value);
  }

  async getEventsForUser(userId: string, userRole?: string): Promise<Result<IEvent[], EventError>> {
    const result = await this.repo.getAllEvents();
    if (result.ok === false) {
      return Err(UnexpectedRepositoryError(result.value.message));
    }
    if (userRole === "admin"){
      return Ok(result.value);
    }
    
    return Ok(
      result.value.filter(e =>
        e.status === "published" ||
        (e.status === "draft" && e.organizerId === userId)
      )
    );
  }

  async getActiveUserEvents(userId: string): Promise<Result<IEvent[], EventError>> {
    const userEvents = await this.repo.getActiveUserEvents(userId);
    if (userEvents.ok === false) {
      return Err(UnexpectedRepositoryError(userEvents.value.message));
    }
    return Ok(userEvents.value);
  }

  async getPastUserEvents(userId: string): Promise<Result<IEvent[], EventError>> {
    const userEvents = await this.repo.getPastUserEvents(userId);
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
      return Err(result.value);
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
      return Err(UnautherizedError("You do not have permission to edit this event."));
    }

    const hasConcluded = event.status === "past" || event.endDatetime <= new Date();
    if (event.status === "cancelled" || hasConcluded) {
      return Err(
        InvalidEventState("Cancelled or concluded events cannot be edited."),
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
      emoji: input.emoji,
      status: input.status,
      rsvpPolicy: input.rsvpPolicy ?? editableEventResult.value.rsvpPolicy,
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
    const isAdmin = actingUserRole === "admin";
    const isOwner = event.organizerId === actingUserId;

    if (!isAdmin && !isOwner) {
      return Err(UnautherizedError("Only the event organizer can publish this event."));
    }

    if (event.status !== "draft") {
      return Err(InvalidEventState("Only draft events can be published."));
    }

    return this.repo.updateEventStatus(eventId, "published");
  }

  async getEventsBySearch(query: string): Promise<Result<IEvent[], EventError>> {
    const trimmedQuery = query.trim();
    
    if (trimmedQuery.length === 0) {
      return Err(InvalidSearchInput("Search query cannot be empty."));
    }
    
    if (trimmedQuery.length < 2) {
      return Err(InvalidSearchInput("Search query must be at least 2 characters long."));
    }
    
    if (trimmedQuery.length > 100) {
      return Err(InvalidSearchInput("Search query must not exceed 100 characters."));
    }

    return this.repo.getEventBySearch(trimmedQuery);
  }

  async getEventsBySearchForUser(query: string, userId: string, userRole: string): Promise<Result<IEvent[], EventError>> {
    const result = await this.getEventsBySearch(query);
    if (!result.ok) {
      return result;
    }

    return Ok(await this.filterJoinableEvents(result.value, userId, userRole));
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
    const isOwner = event.organizerId === actingUserId;

    if (!isAdmin && !isOwner) {
      return Err(UnautherizedError("Invalid Permission."));
    }

    if (event.status !== "published") {
      return Err(InvalidEventState("Only published events can be cancelled."));
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
      result.value.filter(e => e.status !== "past" && e.status !== "cancelled")
    );
  }

  async getActiveEventsForUser(userId: string, userRole: string): Promise<Result<IEvent[], EventError>> {
    const result = await this.getActiveEvents();
    if (!result.ok) {
      return result;
    }

    return Ok(await this.filterJoinableEvents(result.value, userId, userRole));
  }

  async getPastEvents(): Promise<Result<IEvent[], EventError>> {
    const result = await this.repo.getAllEvents();
    if (result.ok === false) {
      return Err(UnexpectedRepositoryError(result.value.message));
    }

    return Ok(
      result.value
        .filter(e => e.status === "past" || e.status === "cancelled")
        .sort((a, b) =>
          b.endDatetime.getTime() - a.endDatetime.getTime()
        )
    );
  }

  async getUsersRSVPedEvents(userId: string): Promise<Result<IEvent[], EventError>> {
    return this.repo.getUsersRSVPedEvents(userId);
  }

  async getAllRSVPedUserByEventId(eventId: number): Promise<Result<string[], EventError>> {
    return this.repo.getAllRSVPedUserByEventId(eventId);
  }
}

export function CreateEventService(repo: IEventRepository, userRepo?: IUserRepository): IEventService {
  return new EventService(repo, userRepo);
}
