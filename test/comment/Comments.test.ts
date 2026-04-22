import { CommentService } from "../../src/service/CommentService";
import { InMemoryCommentRepository } from "../../src/repository/CommentRepository";

const createUser = (id: string, role: "user" | "admin" = "user") => ({
  userId: id,
  displayName: id,
  role,
});

test("should create a comment successfully", async () => {
  const repo = new InMemoryCommentRepository();
  const service = new CommentService(repo);

  const user = createUser("user1");

  const result = await service.addComment(1, "Hello world", user);

  expect(result.ok).toBe(true);
  if (!result.ok) return;

  expect(result.value.content).toBe("Hello world");
  expect(result.value.userId).toBe("user1");
  expect(result.value.eventId).toBe(1);
});

test("should reject empty comment content", async () => {
  const repo = new InMemoryCommentRepository();
  const service = new CommentService(repo);

  const user = createUser("user1");

  const result = await service.addComment(1, "   ", user);

  expect(result.ok).toBe(false);
  if (result.ok) return;

  expect(result.value.name).toBe("InvalidContent");
});

test("should delete a comment successfully", async () => {
  const repo = new InMemoryCommentRepository();
  const service = new CommentService(repo);

  const user = createUser("user1");
  const comment = await service.addComment(1, "Hello world", user)

  const result = await service.deleteComment(1, user)

  expect(result.ok).toBe(true);
});

test("author should be able to delete their own comment", async () => {
  const repo = new InMemoryCommentRepository();
  const service = new CommentService(repo);

  const user = createUser("user1");

  const created = await service.addComment(1, "Hello world", user);
  expect(created.ok).toBe(true);
  if (!created.ok) return;

  const result = await service.deleteComment(created.value.id, user);

  expect(result.ok).toBe(true);
});

test("organizer should be able to delete a comment on their event", async () => {
  const repo = new InMemoryCommentRepository();
  const service = new CommentService(repo);

  const author = createUser("user1");
  const organizer = createUser("organizer1");

  const created = await service.addComment(1, "Hello world", author);
  expect(created.ok).toBe(true);
  if (!created.ok) return;

  const result = await service.deleteComment(created.value.id, organizer);

  expect(result.ok).toBe(true);
});

test("should reject deletion from unauthorized user", async () => {
  const repo = new InMemoryCommentRepository();
  const service = new CommentService(repo);

  const author = createUser("user1");
  const attacker = createUser("user2");

  const created = await service.addComment(1, "Hello world", author);
  expect(created.ok).toBe(true);
  if (!created.ok) return;

  const result = await service.deleteComment(created.value.id, attacker);

  expect(result.ok).toBe(false);
  if (result.ok) return;

  expect(result.value.name).toBe("Forbidden");
});