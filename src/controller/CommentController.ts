import type { Response } from "express";
import type { ILoggingService } from "../service/LoggingService";
import type { IAppBrowserSession } from "../session/AppSession";
import type { ICommentService } from "../service/CommentService";

export interface ICommentController {
  getComments(res: Response, eventId: number, session: IAppBrowserSession): Promise<void>;
  addComment(res: Response, eventId: number, content: string, session: IAppBrowserSession): Promise<void>;
  deleteComment(res: Response, commentId: number, session: IAppBrowserSession): Promise<void>;
}

export class CommentController implements ICommentController {
  constructor(
    private readonly service: ICommentService,
    private readonly logger: ILoggingService,
  ) {}

  async getComments(res: Response, eventId: number, session: IAppBrowserSession): Promise<void> {
    const result = await this.service.getCommentsByEventId(eventId);

    if (!result.ok) {
      this.logger.warn(result.value.message);
      res.status(400).send(result.value.message);
      return;
    }

    res.status(200).render("partials/comments", {
      comments: result.value,
      user: session.authenticatedUser,
    });
  }
}