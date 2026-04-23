import { Request, Response } from 'express';
import { RSVPService } from '../service/RSVPService';
import type { ILoggingService } from "../service/LoggingService";
import { getAuthenticatedUser } from "../session/AppSession";
import type { IRSVP, RSVPError } from "../repository/RSVPRepository";

export class RSVPController {
  constructor(
  private readonly service: RSVPService,
  private readonly logger: ILoggingService,
) {}

  async toggle(req: Request, res: Response) {
    const user = getAuthenticatedUser(req.session as any);

    if (!user) {
      return res.status(401).send("Unauthorized");
    }

    const userId = user.userId;
    const eventId = Number(req.params.id);

    if (!eventId || isNaN(eventId)) {
      return res.status(400).send("Invalid event ID");
    }

    const result = await this.service.toggleRSVP(
      user.userId,
      user.role,
      eventId
    );

    if (result.ok === false) {
      return res.status(400).send(result.value.message);
    }

    const rsvp = result.value;
    return res.render("partials/rsvp-button", {
      rsvp,
      eventId,
      layout: false,
    });
  }

  async dashboard(req: Request, res: Response) {
    const user = getAuthenticatedUser(req.session as any);

    if (!user) {
      return res.status(401).send("Unauthorized");
    }

    const result = await this.service.getUserDashboard(
      user.userId,
      user.role
    );

    if (result.ok === false) {
      return res.status(400).send(result.value.message);
    }

    return res.render("rsvps/dashboard", {
      upcoming: result.value.upcoming,
      past: result.value.past,
      session: { authenticatedUser: user }
    });
  }
}