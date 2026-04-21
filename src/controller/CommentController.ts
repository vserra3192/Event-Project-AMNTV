import type { Response } from "express";
import type { ILoggingService } from "../service/LoggingService";
import type { IAppBrowserSession } from "../session/AppSession";
import type { ICommentService, CommentServiceError } from "../service/CommentService";
import type { IAdminUserService } from "../auth/AdminUserService";
import type { Result } from "../lib/result";
import type { IComment } from "../repository/CommentRepository";

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
  ) {}

  private async loadComments(eventId: number): Promise<Result<IComment[], CommentServiceError>> {
    const result = await this.service.getCommentsByEventId(eventId);

    if (result.ok === false) {
      return result;
    }

    const usersResult = await this.users.listUsers();

    if (usersResult.ok === false) {
      this.logger.warn(usersResult.value.message);
      return {
        ok: true,
        value: result.value,
      };
    }

    const usersMap = new Map(usersResult.value.map(u => [u.id, u]));

    const enriched: IComment[] = result.value.map(comment => ({
      ...comment,
      displayName: usersMap.get(comment.userId)?.displayName
    }));

    return {
      ok: true,
      value: enriched,
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
      comments: result.value,
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
      comments: updated.value,
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
      comments: updated.value,
      user: session.authenticatedUser,
      layout: false,
    });
  }
}