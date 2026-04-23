import { Ok, Err, type Result } from '../lib/result';
import type {
  IRSVPRepository,
  IRSVP,
  RSVPError
} from '../repository/RSVPRepository';
import type { IEventRepository } from '../repository/EventRepository';

export class RSVPService {
  constructor(
    private rsvpRepo: IRSVPRepository,
    private eventRepo: IEventRepository
  ) {}

  async toggleRSVP(
    userId: string,
    role: string,
    eventId: number
  ): Promise<Result<IRSVP, RSVPError>> {

    const eventResult = await this.eventRepo.getEventById(eventId);
    if (!eventResult.ok) {
      return Err({
        type: 'NOT_FOUND',
        message: 'Event not found'
      } as const);
    }

    const event = eventResult.value;

    if (event.status !== 'published') {
      return Err({
        type: 'INVALID',
        message: 'Cannot RSVP to this event'
      } as const);
    }

    const existing = await this.rsvpRepo.findByUserAndEvent(userId, eventId);

    //new
    if (!existing) {
      const goingCount = await this.rsvpRepo.countGoingByEvent(eventId);

      const status =
        event.capacity && goingCount >= event.capacity
          ? 'waitlisted'
          : 'going';

      const newRSVP = this.rsvpRepo.createNew(userId, eventId);
      newRSVP.status = status;

      return this.rsvpRepo.save(newRSVP);
    }

    if (existing.status === 'going' || existing.status === 'waitlisted') {
      existing.status = 'cancelled';
      return this.rsvpRepo.save(existing);
    }

    if (existing.status === 'cancelled') {
      const goingCount = await this.rsvpRepo.countGoingByEvent(eventId);

      const newStatus =
        event.capacity && goingCount >= event.capacity
          ? 'waitlisted'
          : 'going';

      existing.status = newStatus;

      return this.rsvpRepo.save(existing);
    }

    return Ok(existing);
  }

  async getUserRSVP(userId: string, eventId: number)
  : Promise<Result<IRSVP | null, RSVPError>> {

    const rsvp = await this.rsvpRepo.findByUserAndEvent(userId, eventId);

    return Ok(rsvp ?? null);
  }
  
  async getUserDashboard(
    userId: string,
    role: string
  ): Promise<Result<{
    upcoming: any[];
    past: any[];
  }, RSVPError>> {

    // organizers cannot access
    if (role === 'organizer') {
      return Err({
        type: 'UNAUTHORIZED',
        message: 'Organizers cannot view RSVPs dashboard'
      }as const);
    }

    const rsvps = await this.rsvpRepo.findByUser(userId);

    const upcoming: any[] = [];
    const past: any[] = [];

    for (const rsvp of rsvps) {
      const eventResult = await this.eventRepo.getEventById(rsvp.eventId);
      if (!eventResult.ok) continue;

      const event = eventResult.value;

      const item = {
        rsvp,
        event
      };

      if (
        event.status === 'published' &&
        new Date(event.startDatetime) > new Date() &&
        rsvp.status !== 'cancelled'
      ) {
        upcoming.push(item);
      } else {
        past.push(item);
      }
    }

    upcoming.sort(
      (a, b) =>
        new Date(a.event.startDatetime).getTime() -
        new Date(b.event.startDatetime).getTime()
    );

    past.sort(
      (a, b) =>
        new Date(b.event.startDatetime).getTime() -
        new Date(a.event.startDatetime).getTime()
    );

    return Ok({ upcoming, past });
  }
}