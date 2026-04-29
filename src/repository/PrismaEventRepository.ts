import { PrismaClient, Prisma, type Event as PrismaEvent, type EventRsvp as PrismaEventRsvp } from '@prisma/client';
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
    try {
      const event = await this.prisma.event.create({
        data: {
          ...input,
          rsvps: {
            create: [],
          },
        },
        include: {rsvps: true}
      });
      return Ok(this.mapEvent(event));
    } catch (error){
        return Err(
          UnexpectedRepositoryError(
            `Failed to Create Event: ${error instanceof Error ? error.message : String(error)}`
          )
        );
    }
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
    try {
      const now = new Date();
      const events = await this.prisma.event.findMany({
        where: {
          organizerId,
          status: {
            not: 'past',
          },
          endDatetime: {
            gte: now,
          },
        },
        include: { rsvps: true },
      });

      return Ok(events.map((event) => this.mapEvent(event)));
    } catch (error) {
      return Err(
        UnexpectedRepositoryError(
          `Failed to fetch active events for organizer: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }
  }

  async getPastUserEvents(organizerId: string): Promise<Result<IEvent[], EventError>> {
    try {
      const now = new Date();
      const events = await this.prisma.event.findMany({
        where: {
          organizerId,
          OR: [
            { status: 'past' },
            {
              endDatetime: {
                lt: now,
              },
            },
          ],
        },
        include: { rsvps: true },
        orderBy: {
          endDatetime: 'desc',
        },
      });

      return Ok(events.map((event) => this.mapEvent(event)));
    } catch (error) {
      return Err(
        UnexpectedRepositoryError(
          `Failed to fetch past events for organizer: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }
  }

  async updateEvent(id: number, input: UpdateEventInput): Promise<Result<IEvent, EventError>> {
    try {
      if (!Number.isInteger(id) || id < 1) {
        return Err(InvalidId(`${id} is not a valid event id.`));
      }

      const existing = await this.prisma.event.findUnique({
        where: { id },
      });

      if (existing === null) {
        return Err(EventNotFound(`Event with id ${id} was not found.`));
      }

      const updated = await this.prisma.event.update({
        where: { id },
        data: {
          title: input.title,
          description: input.description,
          location: input.location,
          category: input.category,
          status: input.status,
          capacity: input.capacity,
          startDatetime: input.startDatetime,
          endDatetime: input.endDatetime,
        },
        include: { rsvps: true },
      });

      return Ok(this.mapEvent(updated));
    } catch (error) {
      return Err(
        UnexpectedRepositoryError(
          `Failed to update event: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }
  }

  async updateEventStatus(id: number, status: EventStatus): Promise<Result<IEvent, EventError>> {
    try {
      if (!Number.isInteger(id) || id < 1) {
        return Err(InvalidId(`${id} is not a valid event id.`));
      }

      const existing = await this.prisma.event.findUnique({
        where: { id },
      });

      if (existing === null) {
        return Err(EventNotFound(`Event with id ${id} was not found.`));
      }

      const updated = await this.prisma.event.update({
        where: { id },
        data: { status },
        include: { rsvps: true },
      });

      return Ok(this.mapEvent(updated));
    } catch (error) {
      return Err(
        UnexpectedRepositoryError(
          `Failed to update event status: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }
  }

  async getEventBySearch(query: string): Promise<Result<IEvent[], EventError>> {
    try {
      const searchQuery = query.trim();

      const events = await this.prisma.event.findMany({
        where: {
          OR: [
            { title: { contains: searchQuery } },
            { description: { contains: searchQuery } },
            { location: { contains: searchQuery } },
          ],
        },
        include: { rsvps: true },
      }) as Array<PrismaEvent & { rsvps: PrismaEventRsvp[] }>;

      return Ok(events.map((event) => this.mapEvent(event)));
    } catch (error) {
      return Err(
        UnexpectedRepositoryError(
          `Failed to search events: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }
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
    try {
      if (!Number.isInteger(eventId) || eventId < 1) {
        return Err(InvalidId(`${eventId} is not a valid event id.`));
      }

      const event = await this.prisma.event.findUnique({
        where: { id: eventId },
        include: { rsvps: true },
      });

      if (event === null) {
        return Err(EventNotFound(`Event with id ${eventId} was not found.`));
      }

      const alreadyRsvped = event.rsvps.some((rsvp) => rsvp.userId === userId);
      if (alreadyRsvped) {
        return Ok(this.mapEvent(event));
      }

      if (event.capacity !== null && event.rsvps.length >= event.capacity) {
        return Err(UnexpectedRepositoryError('Event capacity has been reached.'));
      }

      try {
        await this.prisma.eventRsvp.create({
          data: {
            eventId,
            userId,
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          return Ok(this.mapEvent(event));
        }
        throw error;
      }

      const updatedEvent = await this.prisma.event.findUnique({
        where: { id: eventId },
        include: { rsvps: true },
      });

      if (updatedEvent === null) {
        return Err(EventNotFound(`Event with id ${eventId} was not found.`));
      }

      return Ok(this.mapEvent(updatedEvent));
    } catch (error) {
      return Err(
        UnexpectedRepositoryError(
          `Failed to rsvp for event: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }
  }

  async rsvpCancelEvent(eventId: number, userId: string): Promise<Result<IEvent, EventError>> {
    try {
      if (!Number.isInteger(eventId) || eventId < 1) {
        return Err(InvalidId(`${eventId} is not a valid event id.`));
      }

      const event = await this.prisma.event.findUnique({
        where: { id: eventId },
        include: { rsvps: true },
      });

      if (event === null) {
        return Err(EventNotFound(`Event with id ${eventId} was not found.`));
      }

      await this.prisma.eventRsvp.deleteMany({
        where: {
          eventId,
          userId,
        },
      });

      const updatedEvent = await this.prisma.event.findUnique({
        where: { id: eventId },
        include: { rsvps: true },
      });

      if (updatedEvent === null) {
        return Err(EventNotFound(`Event with id ${eventId} was not found.`));
      }

      return Ok(this.mapEvent(updatedEvent));
    } catch (error) {
      return Err(
        UnexpectedRepositoryError(
          `Failed to cancel rsvp for event: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }
  }
}

export function CreatePrismaEventRepository(prisma?: PrismaClient): IEventRepository {
  if (prisma != null) {
    return new PrismaEventRepository(prisma);
  }

  const databaseUrl = process.env.DATABASE_URL ?? 'file:./prisma/dev.db';
  const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
  return new PrismaEventRepository(new PrismaClient({ adapter }));
}
