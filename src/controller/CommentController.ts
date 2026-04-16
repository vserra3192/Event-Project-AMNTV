import type { Response } from "express";
import type { IAppBrowserSession } from "../session/AppSession";


export interface ICommentController {
  getComments(res: Response, eventId: number, session: IAppBrowserSession): Promise<void>;
  addComment(res: Response, eventId: number, content: string, session: IAppBrowserSession): Promise<void>;
  deleteComment(res: Response, commentId: number, session: IAppBrowserSession): Promise<void>;
}