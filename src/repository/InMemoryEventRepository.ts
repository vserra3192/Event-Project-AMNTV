import { Ok, Err, type Result } from '../lib/result';
import { type EventError, EventNotFound, InvalidId, UnexpectedRepositoryError } from './Errors';

export type EventStatus = 'draft' | 'published' | 'cancelled' | 'past';

export interface IEvent {
  id: number;
  title: string;
  description: string;
  location: string;
  category: string;
  status: EventStatus;
  capacity: number | null;
  startDatetime: Date;
  endDatetime: Date;
  organizerId: string;
  createdAt: Date;
  updatedAt: Date;
  rsvps: string[];
}

export type CreateEventInput = {
  title: string;
  description: string;
  location: string;
  category: string;
  status: EventStatus;
  capacity: number | null;
  startDatetime: Date;
  endDatetime: Date;
  organizerId: string;
};

export type UpdateEventInput = {
  title: string;
  description: string;
  location: string;
  category: string;
  status: EventStatus;
  capacity: number | null;
  startDatetime: Date;
  endDatetime: Date;
};

export interface IEventRepository {
  createEvent(input: CreateEventInput): Promise<Result<IEvent, EventError>>;
  getEventById(id: number): Promise<Result<IEvent, EventError>>;
  getAllEvents(): Promise<Result<IEvent[], EventError>>;
  getActiveUserEvents(organizerId: string): Promise<Result<IEvent[], EventError>>;
  getPastUserEvents(organizerId: string): Promise<Result<IEvent[], EventError>>;
  updateEvent(id: number, input: UpdateEventInput): Promise<Result<IEvent, EventError>>;
  updateEventStatus(id: number, status: EventStatus): Promise<Result<IEvent, EventError>>;
  getEventBySearch(query: string): Promise<Result<IEvent[], EventError>>;
  getEventsByOrganizerId(organizerId: string): Promise<Result<IEvent[], EventError>>;
  rsvpEvent(eventId: number, userId: string): Promise<Result<IEvent, EventError>>;
  rsvpCancelEvent(eventId: number, userId: string): Promise<Result<IEvent, EventError>>;
  getUsersRSVPedEvents(userId: string): Promise<Result<IEvent[], EventError>>;
  getAllRSVPedUserByEventId(eventId: number): Promise<Result<string[], EventError>>;
}

class InMemoryEventRepository implements IEventRepository {
  private readonly events: Map<number, IEvent> = new Map();
  private nextId = 1;

  async createEvent(input: CreateEventInput): Promise<Result<IEvent, EventError>> {
    try {
      const now = new Date();
      const event: IEvent = {
        id: this.nextId++,
        title: input.title,
        description: input.description,
        location: input.location,
        category: input.category,
        status: input.status,
        capacity: input.capacity,
        startDatetime: input.startDatetime,
        endDatetime: input.endDatetime,
        organizerId: input.organizerId,
        createdAt: now,
        updatedAt: now,
        rsvps: [],
      };
      this.events.set(event.id, event);
      return Ok(event);
    } catch {
      return Err(UnexpectedRepositoryError('Failed to create event.'));
    }
  }

  async getEventById(id: number): Promise<Result<IEvent, EventError>> {
    try {
      if (!Number.isInteger(id) || id < 1) {
        return Err(InvalidId(`${id} is not a valid event id.`));
      }
      const event = this.events.get(id) ?? null;
      if (event === null) {
        return Err(EventNotFound(`Event with id ${id} was not found.`));
      }
      return Ok(event);
    } catch {
      return Err(UnexpectedRepositoryError('Failed to fetch event.'));
    }
  }

  async getAllEvents(): Promise<Result<IEvent[], EventError>> {
    try {
      return Ok([...this.events.values()]);
    } catch {
      return Err(UnexpectedRepositoryError('Failed to list events.'));
    }
  }

  async getActiveUserEvents(organizerId: string): Promise<Result<IEvent[], EventError>> {
    try {
      const now = new Date();
      const events = [...this.events.values()].filter(event => {
        if (event.organizerId !== organizerId) return false;
        const isPast = event.status === 'past' || event.endDatetime < now || event.status === 'cancelled';
        return !isPast;
      });
      return Ok(events);
    } catch {
      return Err(UnexpectedRepositoryError('Failed to fetch active events for organizer.'));
    }
  }

  async getPastUserEvents(organizerId: string): Promise<Result<IEvent[], EventError>> {
    try {
      const now = new Date();
      const events = [...this.events.values()]
        .filter(event => {
          if (event.organizerId !== organizerId) return false;
          const isPast = event.status === 'past' || event.status === 'cancelled' || event.endDatetime < now;
          return isPast;
        })
        .sort((a, b) => b.endDatetime.getTime() - a.endDatetime.getTime());
      return Ok(events);
    } catch {
      return Err(UnexpectedRepositoryError('Failed to fetch past events for organizer.'));
    }
  }

  async getEventsByOrganizerId(organizerId: string): Promise<Result<IEvent[], EventError>> {
    try {
      const events = [...this.events.values()].filter(event => event.organizerId === organizerId);
      return Ok(events);
    } catch {
      return Err(UnexpectedRepositoryError('Failed to fetch events by organizer id.'));
    }
  }

  async updateEvent(id: number, input: UpdateEventInput): Promise<Result<IEvent, EventError>> {
    try {
      if (!Number.isInteger(id) || id < 1) {
        return Err(InvalidId(`${id} is not a valid event id.`));
      }

      const existing = this.events.get(id) ?? null;

      if (existing === null) {
        return Err(EventNotFound(`Event with id ${id} was not found.`));
      }

      const updated: IEvent = {
        ...existing,
        title: input.title,
        description: input.description,
        location: input.location,
        category: input.category,
        status: input.status,
        capacity: input.capacity,
        startDatetime: input.startDatetime,
        endDatetime: input.endDatetime,
        updatedAt: new Date(),
      };

      this.events.set(id, updated);
      return Ok(updated);
    } catch {
      return Err(UnexpectedRepositoryError('Failed to update event.'));
    }
  }

  async rsvpEvent(eventId: number, userId: string): Promise<Result<IEvent, EventError>> {
    try {
      if (!Number.isInteger(eventId) || eventId < 1) {
        return Err(InvalidId(`${eventId} is not a valid event id.`));
      }

      const event = this.events.get(eventId) ?? null;
      if (event === null) {
        return Err(EventNotFound(`Event with id ${eventId} was not found.`));
      }

      if (!event.rsvps.includes(userId)) {
        if (event.capacity !== null && event.rsvps.length >= event.capacity) {
          return Err(UnexpectedRepositoryError('Event capacity has been reached.'));
        }
        event.rsvps.push(userId);
      }

      this.events.set(eventId, event);
      return Ok(event);
    } catch {
      return Err(UnexpectedRepositoryError('Failed to rsvp for event.'));
    }
  }

  async rsvpCancelEvent(eventId: number, userId: string): Promise<Result<IEvent, EventError>> {
    try {
      if (!Number.isInteger(eventId) || eventId < 1) {
        return Err(InvalidId(`${eventId} is not a valid event id.`));
      }
      const event = this.events.get(eventId) ?? null;
      if (event === null) {
        return Err(EventNotFound(`Event with id ${eventId} was not found.`));
      }
      event.rsvps = event.rsvps.filter(id => id !== userId);
      this.events.set(eventId, event);
      return Ok(event);
    } catch {
      return Err(UnexpectedRepositoryError('Failed to cancel rsvp for event.'));
    }
  }
    

  async updateEventStatus(id: number, status: EventStatus): Promise<Result<IEvent, EventError>> {
    try {
      if (!Number.isInteger(id) || id < 1) {
        return Err(InvalidId(`${id} is not a valid event id.`));
      }

      const existing = this.events.get(id) ?? null;
      if (existing === null) {
        return Err(EventNotFound(`Event with id ${id} was not found.`));
      }

      const updated: IEvent = {
        ...existing,
        status,
        updatedAt: new Date(),
      };

      this.events.set(id, updated);
      return Ok(updated);
    } catch {
      return Err(UnexpectedRepositoryError('Failed to update event status.'));
    }
  }

  async getEventBySearch(query: string): Promise<Result<IEvent[], EventError>> {
    try {
      const results = [...this.events.values()].filter(event => 
        event.title.toLowerCase().includes(query.toLowerCase()) ||
        event.description.toLowerCase().includes(query.toLowerCase()) ||
        event.location.toLowerCase().includes(query.toLowerCase())
      );
      return Ok(results);
    } catch {
      return Err(UnexpectedRepositoryError('Failed to search events.'));
    }
  }

  async getUsersRSVPedEvents(userId: string): Promise<Result<IEvent[], EventError>> {
    try {
      const events = [...this.events.values()].filter(event => event.rsvps.includes(userId));
      return Ok(events);
    } catch {
      return Err(UnexpectedRepositoryError('Failed to fetch user\'s rsvped events.'));
    }
  }

  async getAllRSVPedUserByEventId(eventId: number): Promise<Result<string[], EventError>> {
    try {
      if (!Number.isInteger(eventId) || eventId < 1) {
        return Err(InvalidId(`${eventId} is not a valid event id.`));
      }
      const event = this.events.get(eventId) ?? null;
      if (event === null) {
        return Err(EventNotFound(`Event with id ${eventId} was not found.`));
      }
      return Ok(event.rsvps);
    } catch {
      return Err(UnexpectedRepositoryError('Failed to fetch all users who rsvped for the event.'));
    }
  }
}

export function CreateInMemoryEventRepository(): IEventRepository {
  return new InMemoryEventRepository();
}