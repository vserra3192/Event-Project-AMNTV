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