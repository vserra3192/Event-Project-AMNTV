import { CommentService } from "../../src/service/CommentService";
import { CreateEventService } from "../../src/service/EventService";
import { CreatePrismaCommentRepository } from "../../src/repository/PrismaCommentRepository";
import { CreatePrismaEventRepository } from "../../src/repository/PrismaEventRepository";

const createUser = (id: string, role: "user" | "admin" = "user") => ({
  userId: id,
  displayName: id,
  role,
});

function setup() {
  const commentRepo = CreatePrismaCommentRepository();
  const eventRepo = CreatePrismaEventRepository();

  const eventService = CreateEventService(eventRepo);
  const commentService = new CommentService(commentRepo, eventRepo);

  return { eventService, commentService };
}

async function createEvent(eventService: any, organizerId: string, status = "published") {
  const result = await eventService.createEvent(
    {
      title: "Test Event",
      description: "Test",
      location: "Test",
      category: "Test",
      emoji: null,
      status,
      capacity: null,
      startDatetime: new Date(Date.now() + 10000),
      endDatetime: new Date(Date.now() + 20000),
    },
    organizerId
  );

  if (!result.ok) throw new Error("Failed to create event");
  return result.value;
}

test("should create a comment successfully", async () => {
  const { eventService, commentService } = setup();

  const user = createUser("user1");
  const event = await createEvent(eventService, "org1");

  const result = await commentService.addComment(event.id, "Hello world", user);

  expect(result.ok).toBe(true);
  if (!result.ok) return;

  expect(result.value.content).toBe("Hello world");
  expect(result.value.userId).toBe("user1");
  expect(result.value.eventId).toBe(event.id);
});

test("should reject empty comment content", async () => {
  const { eventService, commentService } = setup();

  const user = createUser("user1");
  const event = await createEvent(eventService, "org1");

  const result = await commentService.addComment(event.id, "   ", user);

  expect(result.ok).toBe(false);
  if (result.ok) return;

  expect(result.value.name).toBe("InvalidContent");
});

test("should reject comments on draft events", async () => {
  const { eventService, commentService } = setup();

  const user = createUser("user1");
  const event = await createEvent(eventService, "org1", "draft");

  const result = await commentService.addComment(event.id, "Hello world", user);

  expect(result.ok).toBe(false);
  if (result.ok) return;

  expect(result.value.name).toBe("Forbidden");
});

test("should reject comments on cancelled events", async () => {
  const { eventService, commentService } = setup();

  const user = createUser("user1");
  const event = await createEvent(eventService, "org1", "cancelled");

  const result = await commentService.addComment(event.id, "Hello world", user);

  expect(result.ok).toBe(false);
  if (result.ok) return;

  expect(result.value.name).toBe("Forbidden");
});

test("should display existing comments on cancelled events", async () => {
  const { eventService, commentService } = setup();

  const organizer = createUser("org1");
  const user = createUser("user1");
  const event = await createEvent(eventService, organizer.userId);
  const created = await commentService.addComment(event.id, "Before cancellation", user);
  expect(created.ok).toBe(true);

  const cancelled = await eventService.cancelEvent(event.id, organizer.userId, organizer.role);
  expect(cancelled.ok).toBe(true);

  const result = await commentService.getCommentsByEventId(event.id);

  expect(result.ok).toBe(true);
  if (!result.ok) return;

  expect(result.value).toHaveLength(1);
  expect(result.value[0].content).toBe("Before cancellation");
});

test("author should be able to delete their own comment", async () => {
  const { eventService, commentService } = setup();

  const user = createUser("user1");
  const event = await createEvent(eventService, "org1");

  const created = await commentService.addComment(event.id, "Hello world", user);
  expect(created.ok).toBe(true);
  if (!created.ok) return;

  const result = await commentService.deleteComment(created.value.id, user);

  expect(result.ok).toBe(true);
});

test("should delete a comment successfully", async () => {
  const { eventService, commentService } = setup();

  const user = createUser("user1");
  const event = await createEvent(eventService, "org1");

  const created = await commentService.addComment(event.id, "Hello world", user);
  expect(created.ok).toBe(true);
  if (!created.ok) return;

  const result = await commentService.deleteComment(created.value.id, user);

  expect(result.ok).toBe(true);
});

test("organizer can delete comments on their event", async () => {
  const { eventService, commentService } = setup();

  const organizer = createUser("org1");
  const user = createUser("user1");

  const event = await createEvent(eventService, organizer.userId);

  const comment = await commentService.addComment(event.id, "Hello", user);

  expect(comment.ok).toBe(true);
  if (!comment.ok) return;

  const result = await commentService.deleteComment(comment.value.id, organizer);

  expect(result.ok).toBe(true);
});

test("non-author and non-organizer cannot delete comment", async () => {
  const { eventService, commentService } = setup();

  const organizer = createUser("org1");
  const unauthorized = createUser("unauthorizedUser");
  const user = createUser("user1");

  const event = await createEvent(eventService, organizer.userId);

  const comment = await commentService.addComment(event.id, "Hello", user);

  expect(comment.ok).toBe(true);
  if (!comment.ok) return;

  const result = await commentService.deleteComment(comment.value.id, unauthorized);

  expect(result.ok).toBe(false);
  if (result.ok) return;

  expect(result.value.name).toBe("Forbidden");
});
