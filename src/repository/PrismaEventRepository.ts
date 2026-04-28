import { PrismaClient, type Event as PrismaEvent, type EventRsvp as PrismaEventRsvp } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { IEventRepository, type IEvent, type CreateEventInput, type UpdateEventInput, type EventStatus } from './InMemoryEventRepository';
import { Ok, Err, type Result } from '../lib/result';
import { type EventError, EventNotFound, InvalidId, UnexpectedRepositoryError } from './Errors';

export class PrismaEventRepository implements IEventRepository {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  private mapEvent(event: PrismaEvent & { rsvps: PrismaEventRsvp[] }): IEvent {
    return {
      id: event.id,
      title: event.title,
      description: event.description,
      location: event.location,
      category: event.category,
      status: event.status as EventStatus,
      capacity: event.capacity,
      startDatetime: event.startDatetime,
      endDatetime: event.endDatetime,
      organizerId: event.organizerId,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
      rsvps: event.rsvps.map((rsvp) => rsvp.userId),
    };
  }

  async createEvent(input: CreateEventInput): Promise<Result<IEvent, EventError>> {
    return Err(UnexpectedRepositoryError('createEvent not implemented.'));
  }

  async getEventById(id: number): Promise<Result<IEvent, EventError>> {
    try {
      if (!Number.isInteger(id) || id < 1) {
        return Err(InvalidId(`${id} is not a valid event id.`));
      }

      const event = await this.prisma.event.findUnique({
        where: { id },
        include: { rsvps: true },
      });

      if (event === null) {
        return Err(EventNotFound(`Event with id ${id} was not found.`));
      }

      return Ok(this.mapEvent(event));
    } catch (error) {
      return Err(
        UnexpectedRepositoryError(
          `Failed to fetch event by id: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }
  }

  async getAllEvents(): Promise<Result<IEvent[], EventError>> {
    try {
      const events = await this.prisma.event.findMany({
        include: { rsvps: true },
      });
      return Ok(events.map((event) => this.mapEvent(event)));
    } catch (error) {
      return Err(
        UnexpectedRepositoryError(
          `Failed to list events: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }
  }

  async getActiveUserEvents(organizerId: string): Promise<Result<IEvent[], EventError>> {
    return Err(UnexpectedRepositoryError('getActiveUserEvents not implemented.'));
  }

  async getPastUserEvents(organizerId: string): Promise<Result<IEvent[], EventError>> {
    return Err(UnexpectedRepositoryError('getPastUserEvents not implemented.'));
  }

  async updateEvent(id: number, input: UpdateEventInput): Promise<Result<IEvent, EventError>> {
    return Err(UnexpectedRepositoryError('updateEvent not implemented.'));
  }

  async updateEventStatus(id: number, status: EventStatus): Promise<Result<IEvent, EventError>> {
    return Err(UnexpectedRepositoryError('updateEventStatus not implemented.'));
  }

  async getEventBySearch(query: string): Promise<Result<IEvent[], EventError>> {
    return Err(UnexpectedRepositoryError('getEventBySearch not implemented.'));
  }

  async getEventsByOrganizerId(organizerId: string): Promise<Result<IEvent[], EventError>> {
    try {
      const events = await this.prisma.event.findMany({
        where: { organizerId },
        include: { rsvps: true },
      });
      return Ok(events.map((event) => this.mapEvent(event)));
    } catch (error) {
      return Err(
        UnexpectedRepositoryError(
          `Failed to fetch events by organizer id: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }
  }

  async rsvpEvent(eventId: number, userId: string): Promise<Result<IEvent, EventError>> {
    return Err(UnexpectedRepositoryError('rsvpEvent not implemented.'));
  }

  async rsvpCancelEvent(eventId: number, userId: string): Promise<Result<IEvent, EventError>> {
    return Err(UnexpectedRepositoryError('rsvpCancelEvent not implemented.'));
  }
}

export function CreatePrismaEventRepository(prisma?: PrismaClient): IEventRepository {
  if (prisma != null) {
    return new PrismaEventRepository(prisma);
  }

  const databaseUrl = process.env.DATABASE_URL ?? 'file:./dev.db';
  const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
  return new PrismaEventRepository(new PrismaClient({ adapter }));
}