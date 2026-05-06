import path from "node:path";
import express, { Request, RequestHandler, Response } from "express";
import session from "express-session";
import Layouts from "express-ejs-layouts";
import { IAuthController } from "./auth/AuthController";
import { IFriendsController } from "./auth/FriendsController";
import { IEventController } from "./controller/EventController";
import {
  AuthenticationRequired,
  AuthorizationRequired,
} from "./auth/errors";
import type { UserRole } from "./auth/User";
import { IApp } from "./contracts";
import {
  getAuthenticatedUser,
  isAuthenticatedSession,
  AppSessionStore,
  recordPageView,
  touchAppSession,
} from "./session/AppSession";
import { ILoggingService } from "./service/LoggingService";
import { ICommentController } from "./controller/CommentController";

type AsyncRequestHandler = RequestHandler;

function asyncHandler(fn: AsyncRequestHandler) {
  return function wrapped(req: Request, res: Response, next: (value?: unknown) => void) {
    return Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function sessionStore(req: Request): AppSessionStore {
  return req.session as AppSessionStore;
}

class ExpressApp implements IApp {
  private readonly app: express.Express;

  constructor(
    private readonly authController: IAuthController,
    private readonly eventController: IEventController,
    private readonly commentController: ICommentController,
    private readonly friendsController: IFriendsController,
    private readonly logger: ILoggingService,
  ) {
    this.app = express();
    this.registerMiddleware();
    this.registerTemplating();
    this.registerRoutes();
  }

  private registerMiddleware(): void {
    // Serve static files from src/static (create this directory to add your own assets)
    this.app.use(express.static(path.join(process.cwd(), "src/static")));
    this.app.use(
      session({
        name: "app.sid",
        secret: process.env.SESSION_SECRET ?? "project-starter-demo-secret",
        resave: false,
        saveUninitialized: false,
        cookie: {
          httpOnly: true,
          sameSite: "lax",
        },
      }),
    );
    this.app.use(Layouts);
    this.app.use(express.urlencoded({ extended: true }));
  }

  private registerTemplating(): void {
    this.app.set("view engine", "ejs");
    this.app.set("views", path.join(process.cwd(), "src/views"));
    this.app.set("layout", "layouts/base");
  }

  private isHtmxRequest(req: Request): boolean {
    return req.get("HX-Request") === "true";
  }

  /**
   * Middleware helper: returns true if the request is from an authenticated user.
   * If the user is not authenticated, it handles the response (redirect or 401).
   */
  private requireAuthenticated(req: Request, res: Response): boolean {
    const store = sessionStore(req);
    touchAppSession(store);

    if (getAuthenticatedUser(store)) {
      return true;
    }

    this.logger.warn("Blocked unauthenticated request to a protected route");
    if (this.isHtmxRequest(req) || req.method !== "GET") {
      res.status(401).render("partials/error", {
        message: AuthenticationRequired("Please log in to continue.").message,
        layout: false,
      });
      return false;
    }

    res.redirect("/login");
    return false;
  }

  /**
   * Middleware helper: returns true if the authenticated user has one of the
   * allowed roles. Calls requireAuthenticated first, so unauthenticated
   * requests are handled automatically.
   */
  private requireRole(
    req: Request,
    res: Response,
    allowedRoles: UserRole[],
    message: string,
  ): boolean {
    if (!this.requireAuthenticated(req, res)) {
      return false;
    }

    const currentUser = getAuthenticatedUser(sessionStore(req));
    if (currentUser && allowedRoles.includes(currentUser.role)) {
      return true;
    }

    this.logger.warn(
      `Blocked unauthorized request for role ${currentUser?.role ?? "unknown"}`,
    );
    res.status(403).render("partials/error", {
      message: AuthorizationRequired(message).message,
      layout: false,
    });
    return false;
  }

  private registerRoutes(): void {
    // ── Public routes ────────────────────────────────────────────────

    this.app.get(
      "/",
      asyncHandler(async (req, res) => {
        this.logger.info("GET /");
        const store = sessionStore(req);
        res.redirect(isAuthenticatedSession(store) ? "/home" : "/login");
      }),
    );

    this.app.get(
      "/login",
      asyncHandler(async (req, res) => {
        const store = sessionStore(req);
        const browserSession = recordPageView(store);

        if (getAuthenticatedUser(store)) {
          res.redirect("/home");
          return;
        }

        await this.authController.showLogin(res, browserSession);
      }),
    );

    this.app.post(
      "/login",
      asyncHandler(async (req, res) => {
        const email = typeof req.body.email === "string" ? req.body.email : "";
        const password = typeof req.body.password === "string" ? req.body.password : "";
        await this.authController.loginFromForm(res, email, password, sessionStore(req));
      }),
    );

    this.app.post(
      "/logout",
      asyncHandler(async (req, res) => {
        await this.authController.logoutFromForm(res, sessionStore(req));
      }),
    );

    this.app.get(
      "/events/:id/edit",
      asyncHandler(async (req, res) => {
        if (!this.requireAuthenticated(req, res)) {
          return;
        }

        const browserSession = recordPageView(sessionStore(req));
        await this.eventController.showEventEdit(
          res,
          browserSession,
          Number(req.params.id),
        );
      }),
    );

    this.app.post(
      "/events/:id/edit",
      asyncHandler(async (req, res) => {
        if (!this.requireAuthenticated(req, res)) {
          return;
        }

        const browserSession = touchAppSession(sessionStore(req));
        await this.eventController.submitEventEdit(
          res,
          browserSession,
          Number(req.params.id),
          {
            title: typeof req.body.title === "string" ? req.body.title : "",
            category: typeof req.body.category === "string" ? req.body.category : "",
            emoji: typeof req.body.emoji === "string" ? req.body.emoji : "",
            location: typeof req.body.location === "string" ? req.body.location : "",
            description:
              typeof req.body.description === "string" ? req.body.description : "",
            status: typeof req.body.status === "string" ? req.body.status : "draft",
            capacity: typeof req.body.capacity === "string" ? req.body.capacity : "",
            startDatetime:
              typeof req.body.startDatetime === "string" ? req.body.startDatetime : "",
            endDatetime:
              typeof req.body.endDatetime === "string" ? req.body.endDatetime : "",
          },
        );
      }),
    );

    this.app.post(
      "/events/:id/publish",
      asyncHandler(async (req, res) => {
        if (!this.requireAuthenticated(req, res)) {
          return;
        }

        const browserSession = touchAppSession(sessionStore(req));
        await this.eventController.handlePublishEvent(
          req,
          res,
          browserSession,
          Number(req.params.id),
        );
      }),
    );

    this.app.post(
      "/events/:id/cancel",
      asyncHandler(async (req, res) => {
        if (!this.requireAuthenticated(req, res)) {
          return;
        }

        const browserSession = touchAppSession(sessionStore(req));
        await this.eventController.handleCancelEvent(
          req,
          res,
          browserSession,
          Number(req.params.id),
        );
      }),
    );

    // ── Admin routes ─────────────────────────────────────────────────

    this.app.get(
      "/admin/users",
      asyncHandler(async (req, res) => {
        if (!this.requireRole(req, res, ["admin"], "Only Admin can manage users.")) {
          return;
        }

        const browserSession = recordPageView(sessionStore(req));
        await this.authController.showAdminUsers(res, browserSession);
      }),
    );

    this.app.post(
      "/admin/users",
      asyncHandler(async (req, res) => {
        if (!this.requireRole(req, res, ["admin"], "Only Admin can manage users.")) {
          return;
        }

        const roleValue = typeof req.body.role === "string" ? req.body.role : "user";
        const role: UserRole =
          roleValue === "admin" || roleValue === "staff" || roleValue === "user"
            ? roleValue
            : "user";

        await this.authController.createUserFromForm(
          res,
          {
            email: typeof req.body.email === "string" ? req.body.email : "",
            displayName:
              typeof req.body.displayName === "string" ? req.body.displayName : "",
            password: typeof req.body.password === "string" ? req.body.password : "",
            role,
          },
          touchAppSession(sessionStore(req)),
        );
      }),
    );

    this.app.post(
      "/admin/users/:id/delete",
      asyncHandler(async (req, res) => {
        if (!this.requireRole(req, res, ["admin"], "Only Admin can manage users.")) {
          return;
        }

        const session = touchAppSession(sessionStore(req));
        const currentUser = getAuthenticatedUser(sessionStore(req));
        if (!currentUser) {
          res.status(401).render("partials/error", {
            message: AuthenticationRequired("Please log in to continue.").message,
            layout: false,
          });
          return;
        }

        await this.authController.deleteUserFromForm(
          res,
          typeof req.params.id === "string" ? req.params.id : "",
          currentUser.userId,
          session,
        );
      }),
    );

    // ── Authenticated home page ──────────────────────────────────────
    // TODO: Replace this placeholder with your project's main page.

    this.app.get(
      "/home",
      asyncHandler(async (req, res) => {
        if (!this.requireAuthenticated(req, res)) {
          return;
        }

        const browserSession = recordPageView(sessionStore(req));
        this.logger.info(`GET /home for ${browserSession.browserLabel}`);
        res.render("home", { session: browserSession, pageError: null });
      }),
    );

    this.app.get(
      "/events",
      asyncHandler(async (req, res) => {
        if (!this.requireAuthenticated(req, res)) {
          return;
        }

        const browserSession = recordPageView(sessionStore(req));
        this.logger.info(`GET /events for ${browserSession.browserLabel}`);
        await this.eventController.showAllEvents(res, browserSession);
      }),
    );

    this.app.get(
      "/friends",
      asyncHandler(async (req, res) => {
        if (!this.requireAuthenticated(req, res)) {
          return;
        }

        const browserSession = recordPageView(sessionStore(req));
        const currentUser = getAuthenticatedUser(sessionStore(req));
        if (!currentUser) {
          res.status(401).render("partials/error", {
            message: AuthenticationRequired("Please log in to continue.").message,
            layout: false,
          });
          return;
        }

        this.logger.info(`GET /friends for ${browserSession.browserLabel}`);
        await this.friendsController.showFriendsPage(
          res,
          browserSession,
          currentUser.userId,
        );
      }),
    );

    this.app.get(
      "/friends/search",
      asyncHandler(async (req, res) => {
        if (!this.requireAuthenticated(req, res)) {
          return;
        }

        const browserSession = touchAppSession(sessionStore(req));
        const currentUser = getAuthenticatedUser(sessionStore(req));
        if (!currentUser) {
          res.status(401).render("partials/error", {
            message: AuthenticationRequired("Please log in to continue.").message,
            layout: false,
          });
          return;
        }

        const query = typeof req.query.q === "string" ? req.query.q : "";
        this.logger.info(`GET /friends/search?q=${query} for ${browserSession.browserLabel}`);
        await this.friendsController.searchUsers(
          res,
          browserSession,
          currentUser.userId,
          query,
        );
      }),
    );

    this.app.post(
      "/friends/requests",
      asyncHandler(async (req, res) => {
        if (!this.requireAuthenticated(req, res)) {
          return;
        }

        const browserSession = touchAppSession(sessionStore(req));
        const currentUser = getAuthenticatedUser(sessionStore(req));
        if (!currentUser) {
          res.status(401).render("partials/error", {
            message: AuthenticationRequired("Please log in to continue.").message,
            layout: false,
          });
          return;
        }

        await this.friendsController.sendFriendRequest(
          res,
          browserSession,
          currentUser.userId,
          typeof req.body.userId === "string" ? req.body.userId : "",
        );
      }),
    );

    this.app.post(
      "/friends/requests/:requesterId/accept",
      asyncHandler(async (req, res) => {
        if (!this.requireAuthenticated(req, res)) {
          return;
        }

        const browserSession = touchAppSession(sessionStore(req));
        const currentUser = getAuthenticatedUser(sessionStore(req));
        if (!currentUser) {
          res.status(401).render("partials/error", {
            message: AuthenticationRequired("Please log in to continue.").message,
            layout: false,
          });
          return;
        }

        await this.friendsController.acceptFriendRequest(
          res,
          browserSession,
          currentUser.userId,
          typeof req.params.requesterId === "string" ? req.params.requesterId : "",
        );
      }),
    );

    this.app.post(
      "/friends/requests/:requesterId/decline",
      asyncHandler(async (req, res) => {
        if (!this.requireAuthenticated(req, res)) {
          return;
        }

        const browserSession = touchAppSession(sessionStore(req));
        const currentUser = getAuthenticatedUser(sessionStore(req));
        if (!currentUser) {
          res.status(401).render("partials/error", {
            message: AuthenticationRequired("Please log in to continue.").message,
            layout: false,
          });
          return;
        }

        await this.friendsController.declineFriendRequest(
          res,
          browserSession,
          currentUser.userId,
          typeof req.params.requesterId === "string" ? req.params.requesterId : "",
        );
      }),
    );

    this.app.post(
      "/friends/:friendId/remove",
      asyncHandler(async (req, res) => {
        if (!this.requireAuthenticated(req, res)) {
          return;
        }

        const browserSession = touchAppSession(sessionStore(req));
        const currentUser = getAuthenticatedUser(sessionStore(req));
        if (!currentUser) {
          res.status(401).render("partials/error", {
            message: AuthenticationRequired("Please log in to continue.").message,
            layout: false,
          });
          return;
        }

        await this.friendsController.removeFriend(
          res,
          browserSession,
          currentUser.userId,
          typeof req.params.friendId === "string" ? req.params.friendId : "",
        );
      }),
    );

    this.app.get(
      "/dashboard",
      asyncHandler(async (req, res) => {
        if (!this.requireAuthenticated(req, res)) {
          return;
        }

        const browserSession = recordPageView(sessionStore(req));
        this.logger.info(`GET /dashboard for ${browserSession.browserLabel}`);
        await this.eventController.showEventDashboard(res, browserSession);
      }),
    );

    this.app.get(
      "/dashboard/archive",
      asyncHandler(async (req, res) => {
        if (!this.requireAuthenticated(req, res)) {
          return;
        }

        const browserSession = recordPageView(sessionStore(req));
        this.logger.info(`GET /dashboard/archive for ${browserSession.browserLabel}`);
        await this.eventController.showArchivedDashboard(res, browserSession);
      }),
    );

    this.app.get(
      "/dashboard/list",
      asyncHandler(async (req, res) => {
        if (!this.requireAuthenticated(req, res)) return;

        const browserSession = recordPageView(sessionStore(req));
        const isArchive = typeof req.query.type === "string" && req.query.type === "archive";
        this.logger.info(`GET /dashboard/list?type=${isArchive ? "archive" : "active"} for ${browserSession.browserLabel}`);
        await this.eventController.showDashboardEventsList(res, browserSession, isArchive);
      }),
    );

    this.app.get(
      '/events/new',
      asyncHandler(async (req, res) => {
        if (!this.requireAuthenticated(req, res)) return;
        const browserSession = recordPageView(sessionStore(req));
        this.logger.info(`GET /events/new for ${browserSession.browserLabel}`);
        res.render('events/create', { session: browserSession, pageError: null });
      }),
    );

    this.app.post(
      '/events/new',
      asyncHandler(async (req, res) => {
        if (!this.requireAuthenticated(req, res)) return;
        const browserSession = recordPageView(sessionStore(req));
        this.logger.info(`POST /events for ${browserSession.browserLabel}`);
        await this.eventController.handleCreateEvent(res, browserSession, req.body as Record<string, unknown>, this.isHtmxRequest(req));
      }),
    );

    this.app.get(
      "/events/archive",
      asyncHandler(async (req, res) => {
        if (!this.requireAuthenticated(req, res)) return;

        const session = recordPageView(sessionStore(req));
        await this.eventController.showArchivedEvents(res, session);
      }),
    );

    this.app.get(
      "/events/list",
      asyncHandler(async (req, res) => {
        if (!this.requireAuthenticated(req, res)) return;

        const browserSession = recordPageView(sessionStore(req));
        const isArchive = typeof req.query.type === "string" && req.query.type === "archive";
        this.logger.info(`GET /events/list?type=${isArchive ? "archive" : "active"} for ${browserSession.browserLabel}`);
        await this.eventController.showEventsList(res, browserSession, isArchive);
      }),
    );

    this.app.get(
      "/events/search",
      asyncHandler(async (req, res) => {
        if (!this.requireAuthenticated(req, res)) {
          return;
        }

        const browserSession = recordPageView(sessionStore(req));
        const searchQuery = typeof req.query.q === "string" ? req.query.q.trim() : "";
        this.logger.info(`GET /events/search?q=${searchQuery} for ${browserSession.browserLabel}`);

        await this.eventController.searchEvents(res, browserSession, searchQuery);
      }),
    );

    this.app.get(
      "/events/search/results",
      asyncHandler(async (req, res) => {
        if (!this.requireAuthenticated(req, res)) {
          return;
        }

        const browserSession = recordPageView(sessionStore(req));
        const searchQuery = typeof req.query.q === "string" ? req.query.q.trim() : "";
        this.logger.info(`GET /events/search/results?q=${searchQuery} for ${browserSession.browserLabel}`);

        await this.eventController.searchEventsPartial(res, browserSession, searchQuery);
      }),
    );

    this.app.get(
      '/events/rsvp',
      asyncHandler(async (req, res) => {
        if (!this.requireAuthenticated(req, res)) return;
        const browserSession = recordPageView(sessionStore(req));
        this.logger.info(`GET /events/rsvp for ${browserSession.browserLabel}`);
        await this.eventController.showRSVPDashboard(res, browserSession);
      }),
    );

    this.app.get(
      '/events/:id/rsvped-users',
      asyncHandler(async (req, res) => {
        if (!this.requireAuthenticated(req, res)) return;
        const browserSession = recordPageView(sessionStore(req));
        this.logger.info(`GET /events/${req.params.id}/rsvped-users for ${browserSession.browserLabel}`);
        await this.eventController.showRSVPedUsers(res, browserSession, Number(req.params.id));
      }),
    );

    this.app.get(
      '/events/:id',
      asyncHandler(async (req, res) => {
        if (!this.requireAuthenticated(req, res)) return;
        const browserSession = recordPageView(sessionStore(req));
        this.logger.info(`GET /events/${req.params.id} for ${browserSession.browserLabel}`);
        await this.eventController.showEventDetail(res, browserSession, Number(req.params.id));
      }),
    );

    this.app.post(
      '/events/:id/rsvp',
      asyncHandler(async (req, res) => {
        if (!this.requireAuthenticated(req, res)) return;
        const browserSession = touchAppSession(sessionStore(req));
        this.logger.info(`POST /events/${req.params.id}/rsvp for ${browserSession.browserLabel}`);
        await this.eventController.handleRsvpEvent(res, browserSession, Number(req.params.id));
      }),
    );

    this.app.post(
      '/events/:id/rsvp/cancel',
      asyncHandler(async (req, res) => {
        if (!this.requireAuthenticated(req, res)) return;
        const browserSession = touchAppSession(sessionStore(req));
        this.logger.info(`POST /events/${req.params.id}/rsvp/cancel for ${browserSession.browserLabel}`);
        await this.eventController.handleRsvpCancelEvent(res, browserSession, Number(req.params.id));
      }),
    );

    this.app.post(
      '/events/:id/rsvped-users/:userId/remove',
      asyncHandler(async (req, res) => {
        if (!this.requireAuthenticated(req, res)) return;
        const browserSession = touchAppSession(sessionStore(req));
        this.logger.info(`POST /events/${req.params.id}/rsvped-users/${req.params.userId}/remove for ${browserSession.browserLabel}`);
        await this.eventController.handleRemoveRSVPedUser(
          res,
          browserSession,
          Number(req.params.id),
          String(req.params.userId),
        );
      }),
    );

    // ── Event Comments ─────────────────────────────────────────

    this.app.get(
      "/events/:id/comments",
      asyncHandler(async (req, res) => {
        if (!this.requireAuthenticated(req, res)) return;

        const eventId = Number(req.params.id);
        const session = touchAppSession(sessionStore(req));

        this.logger.info(`GET /events/${eventId}/comments`);

        await this.commentController.getComments(res, eventId, session);
      }),
    );

    this.app.post(
      "/events/:id/comments",
      asyncHandler(async (req, res) => {
        if (!this.requireAuthenticated(req, res)) return;

        const eventId = Number(req.params.id);
        const content =
          typeof req.body.content === "string" ? req.body.content : "";

        const session = touchAppSession(sessionStore(req));

        this.logger.info(`POST /events/${eventId}/comments`);

        await this.commentController.addComment(res, eventId, content, session);
      }),
    );

    this.app.post(
      "/comments/:id/delete",
      asyncHandler(async (req, res) => {
        if (!this.requireAuthenticated(req, res)) return;

        const commentId = Number(req.params.id);
        const eventId = Number(req.query.eventId);
        const session = touchAppSession(sessionStore(req));

        this.logger.info(`POST /comments/${commentId}/delete`);

        await this.commentController.deleteComment(
          res,
          eventId,
          commentId,
          session,
        );
      }),
    );

    // ── Error handler ────────────────────────────────────────────────

    this.app.use((err: unknown, _req: Request, res: Response, _next: (value?: unknown) => void) => {
      const message = err instanceof Error ? err.message : "Unexpected server error.";
      this.logger.error(message);
      res.status(500).render("partials/error", {
        message: "Unexpected server error.",
        layout: false,
      });
    });
  }

  getExpressApp(): express.Express {
    return this.app;
  }
}

export function CreateApp(
  authController: IAuthController,
  eventController: IEventController,
  commentController: ICommentController,
  friendsController: IFriendsController,
  logger: ILoggingService,
): IApp {
  return new ExpressApp(authController, eventController, commentController, friendsController, logger);
}
