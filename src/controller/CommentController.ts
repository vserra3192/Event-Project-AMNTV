import type { Response } from "express";
import type { ILoggingService } from "../service/LoggingService";
import type { IAppBrowserSession } from "../session/AppSession";
import type { ICommentService } from "../service/CommentService";

export interface ICommentController {
  getComments(res: Response, eventId: number, session: IAppBrowserSession): Promise<void>;
  addComment(res: Response, eventId: number, content: string, session: IAppBrowserSession): Promise<void>;
  deleteComment(res: Response, commentId: number, session: IAppBrowserSession): Promise<void>;
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60)    return `${seconds}s ago`;
  if (seconds < 3600)  return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function mapErrorToStatus(name: string): number {
  switch (name) {
    case "Forbidden":       return 403;
    case "CommentNotFound": return 404;
    case "InvalidContent":  return 400;
    default:                return 500;
  }
}

export class CommentController implements ICommentController {
  constructor(
    private readonly service: ICommentService,
    private readonly logger: ILoggingService,
  ) {}

  async getComments(
    res: Response,
    eventId: number,
    session: IAppBrowserSession,
  ): Promise<void> {
    const result = await this.service.getCommentsByEventId(eventId);

    if (!result.ok) {
      const err = result.value as { name: string; message: string };
      this.logger.warn(err.message);
      res.status(mapErrorToStatus(err.name)).send(err.message);
      return;
    }

    res.status(200).render("partials/comments", {
      comments: result.value,
      user: session.authenticatedUser,
      layout: false,
    });
  }

  async addComment(
    res: Response,
    eventId: number,
    content: string,
    session: IAppBrowserSession,
  ): Promise<void> {
    if (!session.authenticatedUser) {
      res.status(401).send("Unauthorized");
      return;
    }

    const result = await this.service.addComment(eventId, content, {
      userId: session.authenticatedUser.userId,
      displayName: session.authenticatedUser.displayName,
      role: session.authenticatedUser.role,
    });

    if (!result.ok) {
      const err = result.value as { name: string; message: string };
      this.logger.warn(err.message);
      res.status(mapErrorToStatus(err.name)).send(err.message);
      return;
    }

    res.status(201).render("partials/comment", {
      comment: result.value,
      user: session.authenticatedUser,
      layout: false,
      timeAgo,
    });
  }

  async deleteComment(
    res: Response,
    commentId: number,
    session: IAppBrowserSession,
  ): Promise<void> {
    if (!session.authenticatedUser) {
      res.status(401).send("Unauthorized");
      return;
    }

    const result = await this.service.deleteComment(commentId, {
      userId: session.authenticatedUser.userId,
      displayName: session.authenticatedUser.displayName,
      role: session.authenticatedUser.role,
    });

    if (!result.ok) {
      const err = result.value as { name: string; message: string };
      this.logger.warn(err.message);
      res.status(mapErrorToStatus(err.name)).send(err.message);
      return;
    }

    res.status(204).send();
  }
}