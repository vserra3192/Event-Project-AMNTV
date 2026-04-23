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
    eventId: number
  ): Promise<Result<IRSVP, RSVPError>> {

    //get event
    const eventResult = await this.eventRepo.getEventById(eventId);
    if (!eventResult.ok) {
      return Err({
        type: 'NOT_FOUND',
        message: 'Event not found'
      } as const);
    }

    const event = eventResult.value;

    // 2. Check if event is valid for RSVP
    if (event.status !== 'published') {
      return Err({
        type: 'INVALID',
        message: 'Cannot RSVP to this event'
      } as const);
    }

    // 3. Check existing RSVP
    const existing = await this.rsvpRepo.findByUserAndEvent(userId, eventId);

    // Case 1: no RSVP → create new
    if (!existing) {
      const newRSVP = {
        id: Date.now(), // simple unique id for in-memory
        userId,
        eventId,
        status: 'going' as const,
        createdAt: new Date(),
      };

      return this.rsvpRepo.save(newRSVP);
    }

    // Case 2: going → cancelled
    if (existing.status === 'going') {
      existing.status = 'cancelled';
      return this.rsvpRepo.save(existing);
    }

    // Case 3: cancelled → going
    if (existing.status === 'cancelled') {
      existing.status = 'going';
      return this.rsvpRepo.save(existing);
    }

    // fallback (shouldn’t really happen in Sprint 1)
    return Ok(existing);
  }
}