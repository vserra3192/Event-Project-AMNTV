import express from "express";
import request from "supertest";
import { CreateInMemoryEventRepository } from "../../src/repository/InMemoryEventRepository";
import { CreateEventService, type CreateEventServiceInput } from "../../src/service/EventService";
import { CreateController } from "../../src/controller/EventController";
import type { ILoggingService } from "../../src/service/LoggingService";
import type { IAdminUserService } from "../../src/auth/AdminUserService";

const ORGANIZER = { userId: "organizer-1", role: "organizer" };
const OTHER_USER = { userId: "other-user", role: "organizer" };
const ADMIN = { userId: "admin-1", role: "admin" };

const BASE_EVENT: CreateEventServiceInput = {
  title: "Campus Workshop",
  description: "Learn something useful.",
  location: "Campus Center",
  category: "Workshop",
  status: "draft",
  capacity: 25,
  startDatetime: new Date("2030-05-01T15:00:00.000Z"),
  endDatetime: new Date("2030-05-01T17:00:00.000Z"),
};

const editForm = (overrides: Partial<Record<string, string>> = {}) => ({
  title: "Updated Event Title",
  description: "Updated event description.",
  location: "Student Union",
  category: "Seminar",
  status: "draft",
  capacity: "40",
  startDatetime: "2030-05-02T12:00",
  endDatetime: "2030-05-02T14:00",
  ...overrides,
});

const parse = (res: request.Response) =>
  JSON.parse(res.text) as Record<string, unknown>;

function createTestApp() {
  const repo = CreateInMemoryEventRepository();
  const service = CreateEventService(repo);

  const logger: ILoggingService = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as ILoggingService;

  const adminUserService: IAdminUserService = {
    findUserById: jest.fn(async (userId: string) => ({
      ok: true,
      value: { userId, displayName: "Test User" },
    })),
  } as unknown as IAdminUserService;

  const controller = CreateController(service, logger, adminUserService);
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use((req, res, next) => {
    res.render = ((view: string, locals?: object) => {
      return res.send(JSON.stringify({ view, ...(locals ?? {}) }));
    }) as typeof res.render;
  
    next();
  });

  const sessionFor = (req: express.Request) => ({
    authenticatedUser: req.header("x-user-id")
      ? {
          userId: req.header("x-user-id"),
          role: req.header("x-user-role") ?? "organizer",
        }
      : null,
  });

  app.post("/events/:id/edit", async (req, res) => {
    await controller.submitEventEdit(
      res,
      sessionFor(req) as never,
      Number(req.params.id),
      req.body,
    );
  });

  app.post("/events/:id/publish", async (req, res) => {
    await controller.handlePublishEvent(
      req,
      res,
      sessionFor(req) as never,
      Number(req.params.id),
    );
  });

  app.post("/events/:id/cancel", async (req, res) => {
    await controller.handleCancelEvent(
      req,
      res,
      sessionFor(req) as never,
      Number(req.params.id),
    );
  });

  return { app, service };
}

async function seedEvent(
  service: ReturnType<typeof createTestApp>["service"],
  overrides: Partial<CreateEventServiceInput> = {},
  organizerId = ORGANIZER.userId,
) {
  const created = await service.createEvent(
    { ...BASE_EVENT, ...overrides },
    organizerId,
  );
  if (!created.ok) throw new Error(created.value.message);
  return created.value.id;
}

describe("EditPublishCancel.integration", () => {
  describe("edit", () => {
    it("updates an event for the organizer", async () => {
      const { app, service } = createTestApp();
      const eventId = await seedEvent(service);

      const res = await request(app)
        .post(`/events/${eventId}/edit`)
        .set("x-user-id", ORGANIZER.userId)
        .set("x-user-role", ORGANIZER.role)
        .type("form")
        .send(editForm());

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(`/events/${eventId}`);

      const updated = await service.getEventByID(eventId);
      expect(updated.ok).toBe(true);
      if (updated.ok) expect(updated.value.title).toBe("Updated Event Title");
    });

    it("returns 400 for invalid edit input", async () => {
      const { app, service } = createTestApp();
      const eventId = await seedEvent(service);

      const res = await request(app)
        .post(`/events/${eventId}/edit`)
        .set("x-user-id", ORGANIZER.userId)
        .type("form")
        .send(editForm({ title: "" }));

      expect(res.status).toBe(400);
      expect(parse(res).pageError).toBe("Title is required.");
    });

    it("returns 403 for unauthorized edit", async () => {
      const { app, service } = createTestApp();
      const eventId = await seedEvent(service);

      const res = await request(app)
        .post(`/events/${eventId}/edit`)
        .set("x-user-id", OTHER_USER.userId)
        .set("x-user-role", OTHER_USER.role)
        .type("form")
        .send(editForm());

      expect(res.status).toBe(403);
      expect(parse(res).pageError).toBe(
        "You do not have permission to edit this event.",
      );
    });

    it("returns 409 when editing a cancelled event", async () => {
      const { app, service } = createTestApp();
      const eventId = await seedEvent(service, { status: "cancelled" });

      const res = await request(app)
        .post(`/events/${eventId}/edit`)
        .set("x-user-id", ORGANIZER.userId)
        .type("form")
        .send(editForm({ status: "cancelled" }));

      expect(res.status).toBe(409);
      expect(parse(res).pageError).toBe(
        "Cancelled or concluded events cannot be edited.",
      );
    });
  });

  describe("publish / cancel", () => {
    it("publishes a draft event with HTMX", async () => {
      const { app, service } = createTestApp();
      const eventId = await seedEvent(service);

      const res = await request(app)
        .post(`/events/${eventId}/publish`)
        .set("x-user-id", ORGANIZER.userId)
        .set("HX-Request", "true");

      expect(res.status).toBe(200);
      expect(parse(res).view).toBe("dashboard/partials/dashboard-event-item");

      const updated = await service.getEventByID(eventId);
      expect(updated.ok).toBe(true);
      if (updated.ok) expect(updated.value.status).toBe("published");
    });

    it("returns 403 for unauthorized publish", async () => {
      const { app, service } = createTestApp();
      const eventId = await seedEvent(service);

      const res = await request(app)
        .post(`/events/${eventId}/publish`)
        .set("x-user-id", OTHER_USER.userId)
        .set("HX-Request", "true");

      expect(res.status).toBe(403);
      expect(parse(res).pageError).toBe(
        "Only the event organizer can publish this event.",
      );
    });

    it("returns 409 when publishing a non-draft event", async () => {
      const { app, service } = createTestApp();
      const eventId = await seedEvent(service, { status: "published" });

      const res = await request(app)
        .post(`/events/${eventId}/publish`)
        .set("x-user-id", ORGANIZER.userId)
        .set("HX-Request", "true");

      expect(res.status).toBe(409);
      expect(parse(res).pageError).toBe(
        "Only draft events can be published.",
      );
    });

    it("cancels a published event with HTMX", async () => {
      const { app, service } = createTestApp();
      const eventId = await seedEvent(service, { status: "published" });

      const res = await request(app)
        .post(`/events/${eventId}/cancel`)
        .set("x-user-id", ADMIN.userId)
        .set("x-user-role", ADMIN.role)
        .set("HX-Request", "true");

      expect(res.status).toBe(200);
      expect(parse(res).view).toBe("dashboard/partials/dashboard-event-item");

      const updated = await service.getEventByID(eventId);
      expect(updated.ok).toBe(true);
      if (updated.ok) expect(updated.value.status).toBe("cancelled");
    });

    it("returns 404 for missing event on cancel", async () => {
      const { app } = createTestApp();

      const res = await request(app)
        .post("/events/999/cancel")
        .set("x-user-id", ORGANIZER.userId)
        .set("HX-Request", "true");

      expect(res.status).toBe(404);
      expect(parse(res).message).toBe("Event with id 999 was not found.");
    });

    it("returns 409 when cancelling a draft event", async () => {
      const { app, service } = createTestApp();
      const eventId = await seedEvent(service);

      const res = await request(app)
        .post(`/events/${eventId}/cancel`)
        .set("x-user-id", ORGANIZER.userId)
        .set("HX-Request", "true");

      expect(res.status).toBe(409);
      expect(parse(res).pageError).toBe(
        "Only published events can be cancelled.",
      );
    });
  });
});