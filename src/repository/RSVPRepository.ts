import { Ok, Err, type Result } from '../lib/result';

export type RSVPStatus = 'going' | 'waitlisted' | 'cancelled';

export interface IRSVP {
  id: number;
  eventId: number;
  userId: string;
  status: RSVPStatus;
  createdAt: Date;
}

export type RSVPError =
  | { type: 'NOT_FOUND'; message: string }
  | { type: 'INVALID'; message: string }
  | { type: 'UNAUTHORIZED'; message: string }
  | { type: 'CONFLICT'; message: string };

export interface IRSVPRepository {
  findByUserAndEvent(userId: string, eventId: number): Promise<IRSVP | null>;
  findByUser(userId: string): Promise<IRSVP[]>;
  save(rsvp: IRSVP): Promise<Result<IRSVP, RSVPError>>;
}

class InMemoryRSVPRepository implements IRSVPRepository {
  private rsvps: Map<number, IRSVP> = new Map();
  private nextId = 1;

  async findByUserAndEvent(userId: string, eventId: number) {
    return (
      [...this.rsvps.values()].find(
        r => r.userId === userId && r.eventId === eventId
      ) ?? null
    );
  }

  async findByUser(userId: string) {
    return [...this.rsvps.values()].filter(r => r.userId === userId);
  }

  async save(rsvp: IRSVP): Promise<Result<IRSVP, RSVPError>> {
    this.rsvps.set(rsvp.id, rsvp);
    return Ok(rsvp);
  }

  createNew(userId: string, eventId: number): IRSVP {
    return {
      id: this.nextId++,
      userId,
      eventId,
      status: 'going',
      createdAt: new Date(),
    };
  }
}

export function CreateInMemoryRSVPRepository(): IRSVPRepository {
  return new InMemoryRSVPRepository();
}