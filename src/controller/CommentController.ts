import type { Response } from "express";
import type { ILoggingService } from "../service/LoggingService";
import type { IAppBrowserSession } from "../session/AppSession";
import type { ICommentService, CommentServiceError } from "../service/CommentService";
import type { IAdminUserService } from "../auth/AdminUserService";
import type { IEventService } from "../service/EventService";
import type { Result } from "../lib/result";
import type { IComment } from "../repository/InMemoryCommentRepository";

export interface ICommentController {
  getComments(res: Response, eventId: number, session: IAppBrowserSession): Promise<void>;
  addComment(res: Response, eventId: number, content: string, session: IAppBrowserSession): Promise<void>;
  deleteComment(res: Response, eventId: number, commentId: number, session: IAppBrowserSession): Promise<void>;
}

function mapErrorToStatus(name: string): number {
  switch (name) {
    case "Forbidden":
      return 403;
    case "CommentNotFound":
      return 404;
    case "InvalidContent":
      return 400;
    default:
      return 500;
  }
}

export class CommentController implements ICommentController {
  constructor(
    private readonly service: ICommentService,
    private readonly logger: ILoggingService,
    private readonly users: IAdminUserService,
    private readonly events: IEventService,
  ) {}

  private async loadComments(eventId: number): Promise<Result<{ comments: (IComment & { displayName?: string })[]; organizerId: string }, CommentServiceError>> {
    const commentsResult = await this.service.getCommentsByEventId(eventId);
    if (commentsResult.ok === false) {
      return commentsResult;
    }

    const eventResult = await this.events.getEventByID(eventId);
    if (eventResult.ok === false) {
      return {
        ok: false,
        value: eventResult.value,
      } as any;
    }

    const usersResult = await this.users.listUsers();

    const usersMap = new Map(
      usersResult.ok
        ? usersResult.value.map(u => [u.id, u])
        : [],
    );

    const enriched = commentsResult.value.map(comment => ({
      ...comment,
      displayName: usersMap.get(comment.userId)?.displayName,
    }));

    return {
      ok: true,
      value: {
        comments: enriched,
        organizerId: eventResult.value.organizerId,
      },
    };
  }

  async getComments(res: Response, eventId: number, session: IAppBrowserSession): Promise<void> {
    const result = await this.loadComments(eventId);

    if (result.ok === false) {
      const err = result.value;
      this.logger.warn(err.message);
      res.status(mapErrorToStatus(err.name)).send(err.message);
      return;
    }

    res.status(200).render("partials/comments", {
      comments: result.value.comments,
      organizerId: result.value.organizerId,
      user: session.authenticatedUser,
      layout: false,
    });
  }

  async addComment(res: Response, eventId: number, content: string, session: IAppBrowserSession): Promise<void> {
    if (!session.authenticatedUser) {
      res.status(401).send("Unauthorized");
      return;
    }

    const result = await this.service.addComment(eventId, content, {
      userId: session.authenticatedUser.userId,
      displayName: session.authenticatedUser.displayName,
      role: session.authenticatedUser.role,
    });

    if (result.ok === false) {
      const err = result.value;
      this.logger.warn(err.message);
      res.status(mapErrorToStatus(err.name)).send(err.message);
      return;
    }

    const updated = await this.loadComments(eventId);

    if (updated.ok === false) {
      const err = updated.value;
      this.logger.error(err.message);
      res.status(mapErrorToStatus(err.name)).send(err.message);
      return;
    }

    res.status(200).render("partials/comments", {
      comments: updated.value.comments,
      organizerId: updated.value.organizerId,
      user: session.authenticatedUser,
      layout: false,
    });
  }

  async deleteComment(res: Response, eventId: number, commentId: number, session: IAppBrowserSession): Promise<void> {
    if (!session.authenticatedUser) {
      res.status(401).send("Unauthorized");
      return;
    }

    const result = await this.service.deleteComment(commentId, {
      userId: session.authenticatedUser.userId,
      displayName: session.authenticatedUser.displayName,
      role: session.authenticatedUser.role,
    });

    if (result.ok === false) {
      const err = result.value;
      this.logger.warn(err.message);
      res.status(mapErrorToStatus(err.name)).send(err.message);
      return;
    }

    const updated = await this.loadComments(eventId);

    if (updated.ok === false) {
      const err = updated.value;
      this.logger.error(err.message);
      res.status(mapErrorToStatus(err.name)).send(err.message);
      return;
    }

    res.status(200).render("partials/comments", {
      comments: updated.value.comments,
      organizerId: updated.value.organizerId,
      user: session.authenticatedUser,
      layout: false,
    });
  }
}