import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { CreateInMemoryEventRepository } from "../../src/repository/EventRepository";
import { CreateEventService, type CreateEventServiceInput } from "../../src/service/EventService";
import { CreateController } from "../../src/controller/EventController";
import type { ILoggingService } from "../../src/service/LoggingService";
import type { IAdminUserService } from "../../src/auth/AdminUserService";

type SessionUser = {
  userId: string;
  role: string;
};

const ORGANIZER: SessionUser = { userId: "organizer-1", role: "organizer" };
const OTHER_USER: SessionUser = { userId: "other-user", role: "organizer" };
const ADMIN_USER: SessionUser = { userId: "admin-1", role: "admin" };

const BASE_DRAFT_EVENT: CreateEventServiceInput = {
  title: "Campus Workshop",
  description: "Learn something useful.",
  location: "Campus Center",
  category: "Workshop",
  status: "draft",
  capacity: 25,
  startDatetime: new Date("2030-05-01T15:00:00.000Z"),
  endDatetime: new Date("2030-05-01T17:00:00.000Z"),
};

const BASE_PUBLISHED_EVENT: CreateEventServiceInput = {
  ...BASE_DRAFT_EVENT,
  title: "Published Campus Workshop",
  status: "published",
};

function makeLogger(): ILoggingService {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as ILoggingService;
}

function makeAdminUserService(): IAdminUserService {
  return {
    findUserById: jest.fn(async (userId: string) => ({
      ok: true,
      value: {
        userId,
        displayName: userId === ORGANIZER.userId ? "Organizer One" : "Test User",
      },
    })),
  } as unknown as IAdminUserService;
}

function makeSession(req: Request) {
  const userId = req.header("x-user-id");
  const role = req.header("x-user-role") ?? "organizer";

  return {
    authenticatedUser: userId
      ? {
          userId,
          role,
        }
      : null,
  };
}

function installRenderInterceptor(app: express.Express): void {
  app.use((req: Request, res: Response, next: NextFunction) => {
    const originalRender = res.render.bind(res);

    res.render = function render(view: string, locals?: object, callback?: (err: Error | null, html?: string) => void) {
      const payload = {
        view,
        ...(locals ?? {}),
      };

      if (typeof callback === "function") {
        callback(null, JSON.stringify(payload));
        return res;
      }

      return res.send(JSON.stringify(payload));
    } as Response["render"];

    res.locals.__originalRender = originalRender;
    next();
  });
}

function createTestApp() {
  const repo = CreateInMemoryEventRepository();
  const service = CreateEventService(repo);
  const logger = makeLogger();
  const adminUserService = makeAdminUserService();
  const controller = CreateController(service, logger, adminUserService);

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  installRenderInterceptor(app);

  app.get("/events/:id/edit", async (req, res) => {
    await controller.showEventEdit(
      res,
      makeSession(req) as never,
      Number(req.params.id),
    );
  });

  app.post("/events/:id/edit", async (req, res) => {
    await controller.submitEventEdit(
      res,
      makeSession(req) as never,
      Number(req.params.id),
      req.body,
    );
  });

  app.post("/events/:id/publish", async (req, res) => {
    await controller.handlePublishEvent(
      req,
      res,
      makeSession(req) as never,
      Number(req.params.id),
    );
  });

  app.post("/events/:id/cancel", async (req, res) => {
    await controller.handleCancelEvent(
      req,
      res,
      makeSession(req) as never,
      Number(req.params.id),
    );
  });

  return { app, service };
}

async function seedEvent(
  service: ReturnType<typeof createTestApp>["service"],
  overrides: Partial<CreateEventServiceInput> = {},
  organizerId = ORGANIZER.userId,
): Promise<number> {
  const created = await service.createEvent(
    {
      ...BASE_DRAFT_EVENT,
      ...overrides,
    },
    organizerId,
  );

  if (!created.ok) {
    throw new Error(`Failed to seed event: ${created.value.message}`);
  }

  return created.value.id;
}

function editForm(overrides: Partial<Record<string, string>> = {}) {
  return {
    title: "Updated Event Title",
    description: "Updated event description.",
    location: "Student Union",
    category: "Seminar",
    status: "draft",
    capacity: "40",
    startDatetime: "2030-05-02T12:00",
    endDatetime: "2030-05-02T14:00",
    ...overrides,
  };
}

function parseBody(response: request.Response): Record<string, unknown> {
  return JSON.parse(response.text) as Record<string, unknown>;
}

describe("EditPublishCancel.integration", () => {
  describe("edit event", () => {
    it("shows the edit form for the organizer", async () => {
      const { app, service } = createTestApp();
      const eventId = await seedEvent(service);

      const response = await request(app)
        .get(`/events/${eventId}/edit`)
        .set("x-user-id", ORGANIZER.userId)
        .set("x-user-role", ORGANIZER.role);

      expect(response.status).toBe(200);
      const body = parseBody(response);
      expect(body.view).toBe("events/edit");
      expect(body.pageError).toBeNull();
      expect(body.eventId).toBe(eventId);
    });

    it("updates an event for the organizer and redirects to detail", async () => {
      const { app, service } = createTestApp();
      const eventId = await seedEvent(service);

      const response = await request(app)
        .post(`/events/${eventId}/edit`)
        .set("x-user-id", ORGANIZER.userId)
        .set("x-user-role", ORGANIZER.role)
        .type("form")
        .send(editForm());

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(`/events/${eventId}`);

      const updated = await service.getEventByID(eventId);
      expect(updated.ok).toBe(true);
      if (updated.ok) {
        expect(updated.value.title).toBe("Updated Event Title");
        expect(updated.value.location).toBe("Student Union");
        expect(updated.value.capacity).toBe(40);
      }
    });

    it("returns 400 and re-renders edit view for invalid edit input", async () => {
      const { app, service } = createTestApp();
      const eventId = await seedEvent(service);

      const response = await request(app)
        .post(`/events/${eventId}/edit`)
        .set("x-user-id", ORGANIZER.userId)
        .set("x-user-role", ORGANIZER.role)
        .type("form")
        .send(editForm({ title: "" }));

      expect(response.status).toBe(400);
      const body = parseBody(response);
      expect(body.view).toBe("events/edit");
      expect(body.pageError).toBe("Title is required.");
      expect(body.eventId).toBe(eventId);
    });

    it("returns 403 for a logged-in user without permission", async () => {
      const { app, service } = createTestApp();
      const eventId = await seedEvent(service);

      const response = await request(app)
        .post(`/events/${eventId}/edit`)
        .set("x-user-id", OTHER_USER.userId)
        .set("x-user-role", OTHER_USER.role)
        .type("form")
        .send(editForm());

      expect(response.status).toBe(403);
      const body = parseBody(response);
      expect(body.view).toBe("events/edit");
      expect(body.pageError).toBe("You do not have permission to edit this event.");
      expect(body.eventId).toBe(eventId);
    });

    it("returns 404 partial error when editing a missing event", async () => {
      const { app } = createTestApp();

      const response = await request(app)
        .post("/events/999/edit")
        .set("x-user-id", ORGANIZER.userId)
        .set("x-user-role", ORGANIZER.role)
        .type("form")
        .send(editForm());

      expect(response.status).toBe(404);
      const body = parseBody(response);
      expect(body.view).toBe("partials/error");
      expect(body.message).toBe("Event with id 999 was not found.");
    });

    it("returns 400 for an invalid event id on edit", async () => {
      const { app } = createTestApp();

      const response = await request(app)
        .post("/events/0/edit")
        .set("x-user-id", ORGANIZER.userId)
        .set("x-user-role", ORGANIZER.role)
        .type("form")
        .send(editForm());

      expect(response.status).toBe(400);
      const body = parseBody(response);
      expect(body.view).toBe("events/edit");
      expect(body.pageError).toBe("ID must be a positive integer.");
      expect(body.eventId).toBe(0);
    });

    it("returns 409 when editing a cancelled event", async () => {
      const { app, service } = createTestApp();
      const eventId = await seedEvent(service, { status: "cancelled", title: "Cancelled Event" });

      const response = await request(app)
        .post(`/events/${eventId}/edit`)
        .set("x-user-id", ORGANIZER.userId)
        .set("x-user-role", ORGANIZER.role)
        .type("form")
        .send(editForm({ status: "cancelled" }));

      expect(response.status).toBe(409);
      const body = parseBody(response);
      expect(body.view).toBe("events/edit");
      expect(body.pageError).toBe("Cancelled or concluded events cannot be edited.");
    });

    it("returns 400 when end time is before start time", async () => {
      const { app, service } = createTestApp();
      const eventId = await seedEvent(service);

      const response = await request(app)
        .post(`/events/${eventId}/edit`)
        .set("x-user-id", ORGANIZER.userId)
        .set("x-user-role", ORGANIZER.role)
        .type("form")
        .send(
          editForm({
            startDatetime: "2030-05-02T14:00",
            endDatetime: "2030-05-02T12:00",
          }),
        );

      expect(response.status).toBe(400);
      const body = parseBody(response);
      expect(body.view).toBe("events/edit");
      expect(body.pageError).toBe("End date/time must be after start date/time.");
    });

    it("returns 401 partial error when unauthenticated user tries to edit", async () => {
      const { app, service } = createTestApp();
      const eventId = await seedEvent(service);

      const response = await request(app)
        .post(`/events/${eventId}/edit`)
        .type("form")
        .send(editForm());

      expect(response.status).toBe(401);
      const body = parseBody(response);
      expect(body.view).toBe("partials/error");
      expect(body.message).toBe("Please log in to continue.");
    });
  });

  describe("publish event", () => {
    it("publishes a draft event and returns the dashboard HTMX partial", async () => {
      const { app, service } = createTestApp();
      const eventId = await seedEvent(service, BASE_DRAFT_EVENT);

      const response = await request(app)
        .post(`/events/${eventId}/publish`)
        .set("x-user-id", ORGANIZER.userId)
        .set("x-user-role", ORGANIZER.role)
        .set("HX-Request", "true");

      expect(response.status).toBe(200);
      const body = parseBody(response);
      expect(body.view).toBe("dashboard/partials/dashboard-event-item");

      const updated = await service.getEventByID(eventId);
      expect(updated.ok).toBe(true);
      if (updated.ok) {
        expect(updated.value.status).toBe("published");
      }
    });

    it("redirects on successful non-HTMX publish", async () => {
      const { app, service } = createTestApp();
      const eventId = await seedEvent(service);

      const response = await request(app)
        .post(`/events/${eventId}/publish`)
        .set("x-user-id", ORGANIZER.userId)
        .set("x-user-role", ORGANIZER.role);

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(`/events/${eventId}`);

      const updated = await service.getEventByID(eventId);
      expect(updated.ok).toBe(true);
      if (updated.ok) {
        expect(updated.value.status).toBe("published");
      }
    });

    it("returns 403 and re-renders detail view for unauthorized publish", async () => {
      const { app, service } = createTestApp();
      const eventId = await seedEvent(service);

      const response = await request(app)
        .post(`/events/${eventId}/publish`)
        .set("x-user-id", OTHER_USER.userId)
        .set("x-user-role", OTHER_USER.role)
        .set("HX-Request", "true");

      expect(response.status).toBe(403);
      const body = parseBody(response);
      expect(body.view).toBe("events/detail");
      expect(body.pageError).toBe("Only the event organizer can publish this event.");
    });

    it("returns 404 partial error when publishing a missing event", async () => {
      const { app } = createTestApp();

      const response = await request(app)
        .post("/events/999/publish")
        .set("x-user-id", ORGANIZER.userId)
        .set("x-user-role", ORGANIZER.role)
        .set("HX-Request", "true");

      expect(response.status).toBe(404);
      const body = parseBody(response);
      expect(body.view).toBe("partials/error");
      expect(body.message).toBe("Event with id 999 was not found.");
    });

    it("returns 409 and re-renders detail view when publishing a non-draft event", async () => {
      const { app, service } = createTestApp();
      const eventId = await seedEvent(service, BASE_PUBLISHED_EVENT);

      const response = await request(app)
        .post(`/events/${eventId}/publish`)
        .set("x-user-id", ORGANIZER.userId)
        .set("x-user-role", ORGANIZER.role)
        .set("HX-Request", "true");

      expect(response.status).toBe(409);
      const body = parseBody(response);
      expect(body.view).toBe("events/detail");
      expect(body.pageError).toBe("Only draft events can be published.");
    });

    it("returns 401 partial error when unauthenticated user tries to publish", async () => {
      const { app, service } = createTestApp();
      const eventId = await seedEvent(service);

      const response = await request(app)
        .post(`/events/${eventId}/publish`)
        .set("HX-Request", "true");

      expect(response.status).toBe(401);
      const body = parseBody(response);
      expect(body.view).toBe("partials/error");
      expect(body.message).toBe("Please log in to continue.");
    });

    it("allows an admin to publish someone else's draft event", async () => {
      const { app, service } = createTestApp();
      const eventId = await seedEvent(service);

      const response = await request(app)
        .post(`/events/${eventId}/publish`)
        .set("x-user-id", ADMIN_USER.userId)
        .set("x-user-role", ADMIN_USER.role)
        .set("HX-Request", "true");

      expect(response.status).toBe(200);
      const body = parseBody(response);
      expect(body.view).toBe("dashboard/partials/dashboard-event-item");
    });
  });

  describe("cancel event", () => {
    it("cancels a published event and returns the dashboard HTMX partial", async () => {
      const { app, service } = createTestApp();
      const eventId = await seedEvent(service, BASE_PUBLISHED_EVENT);

      const response = await request(app)
        .post(`/events/${eventId}/cancel`)
        .set("x-user-id", ORGANIZER.userId)
        .set("x-user-role", ORGANIZER.role)
        .set("HX-Request", "true");

      expect(response.status).toBe(200);
      const body = parseBody(response);
      expect(body.view).toBe("dashboard/partials/dashboard-event-item");

      const updated = await service.getEventByID(eventId);
      expect(updated.ok).toBe(true);
      if (updated.ok) {
        expect(updated.value.status).toBe("cancelled");
      }
    });

    it("redirects on successful non-HTMX cancel", async () => {
      const { app, service } = createTestApp();
      const eventId = await seedEvent(service, BASE_PUBLISHED_EVENT);

      const response = await request(app)
        .post(`/events/${eventId}/cancel`)
        .set("x-user-id", ORGANIZER.userId)
        .set("x-user-role", ORGANIZER.role);

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(`/events/${eventId}`);
    });

    it("returns 403 and re-renders detail view for unauthorized cancel", async () => {
      const { app, service } = createTestApp();
      const eventId = await seedEvent(service, BASE_PUBLISHED_EVENT);

      const response = await request(app)
        .post(`/events/${eventId}/cancel`)
        .set("x-user-id", OTHER_USER.userId)
        .set("x-user-role", OTHER_USER.role)
        .set("HX-Request", "true");

      expect(response.status).toBe(403);
      const body = parseBody(response);
      expect(body.view).toBe("events/detail");
      expect(body.pageError).toBe("Invalid Permission.");
    });

    it("returns 404 partial error when cancelling a missing event", async () => {
      const { app } = createTestApp();

      const response = await request(app)
        .post("/events/999/cancel")
        .set("x-user-id", ORGANIZER.userId)
        .set("x-user-role", ORGANIZER.role)
        .set("HX-Request", "true");

      expect(response.status).toBe(404);
      const body = parseBody(response);
      expect(body.view).toBe("partials/error");
      expect(body.message).toBe("Event with id 999 was not found.");
    });

    it("returns 409 and re-renders detail view when cancelling a draft event", async () => {
      const { app, service } = createTestApp();
      const eventId = await seedEvent(service, BASE_DRAFT_EVENT);

      const response = await request(app)
        .post(`/events/${eventId}/cancel`)
        .set("x-user-id", ORGANIZER.userId)
        .set("x-user-role", ORGANIZER.role)
        .set("HX-Request", "true");

      expect(response.status).toBe(409);
      const body = parseBody(response);
      expect(body.view).toBe("events/detail");
      expect(body.pageError).toBe("Only published events can be cancelled.");
    });

    it("returns 401 partial error when unauthenticated user tries to cancel", async () => {
      const { app, service } = createTestApp();
      const eventId = await seedEvent(service, BASE_PUBLISHED_EVENT);

      const response = await request(app)
        .post(`/events/${eventId}/cancel`)
        .set("HX-Request", "true");

      expect(response.status).toBe(401);
      const body = parseBody(response);
      expect(body.view).toBe("partials/error");
      expect(body.message).toBe("Please log in to continue.");
    });

    it("allows an admin to cancel someone else's published event", async () => {
      const { app, service } = createTestApp();
      const eventId = await seedEvent(service, BASE_PUBLISHED_EVENT);

      const response = await request(app)
        .post(`/events/${eventId}/cancel`)
        .set("x-user-id", ADMIN_USER.userId)
        .set("x-user-role", ADMIN_USER.role)
        .set("HX-Request", "true");

      expect(response.status).toBe(200);
      const body = parseBody(response);
      expect(body.view).toBe("dashboard/partials/dashboard-event-item");
    });
  });
});
