import { CreateInMemoryUserRepository } from "../../src/auth/InMemoryUserRepository";
import { CreatePrismaUserRepository } from "../../src/auth/PrismaUserRepository";
import type { IUserRecord } from "../../src/auth/User";
import type { IUserRepository } from "../../src/auth/UserRepository";

const uniqueId = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const testUser = (id: string): IUserRecord => ({
  id,
  email: `${id}@app.test`,
  displayName: id,
  role: "user",
  passwordHash: "hash",
  freindsList: [],
  outgoingFriendRequests: [],
  ingoingFriendRequests: [],
});

async function createPair(repo: IUserRepository): Promise<[IUserRecord, IUserRecord]> {
  const first = testUser(uniqueId("friend-a"));
  const second = testUser(uniqueId("friend-b"));

  const firstResult = await repo.createUser(first);
  const secondResult = await repo.createUser(second);

  expect(firstResult.ok).toBe(true);
  expect(secondResult.ok).toBe(true);

  return [first, second];
}

describe.each([
  ["in-memory", () => CreateInMemoryUserRepository()],
  ["prisma", () => CreatePrismaUserRepository()],
] as const)("UserRepository friends (%s)", (_name, createRepo) => {
  let repo: IUserRepository;

  beforeEach(() => {
    repo = createRepo();
  });

  it("tracks outgoing and ingoing friend requests", async () => {
    const [sender, receiver] = await createPair(repo);

    const request = await repo.sendFriendRequest(sender.id, receiver.id);
    expect(request.ok).toBe(true);
    if (request.ok) {
      expect(request.value).toBe(true);
    }

    const reloadedSender = await repo.findById(sender.id);
    const reloadedReceiver = await repo.findById(receiver.id);

    expect(reloadedSender.ok && reloadedSender.value?.outgoingFriendRequests).toContain(receiver.id);
    expect(reloadedReceiver.ok && reloadedReceiver.value?.ingoingFriendRequests).toContain(sender.id);
  });

  it("accepts requests and exposes friends from both sides", async () => {
    const [sender, receiver] = await createPair(repo);

    await repo.sendFriendRequest(sender.id, receiver.id);
    const accepted = await repo.acceptFriendRequest(receiver.id, sender.id);
    expect(accepted.ok).toBe(true);
    if (accepted.ok) {
      expect(accepted.value).toBe(true);
    }

    const senderFriends = await repo.getFriendList(sender.id);
    const receiverFriends = await repo.getFriendList(receiver.id);

    expect(senderFriends.ok && senderFriends.value.map((friend) => friend.id)).toContain(receiver.id);
    expect(receiverFriends.ok && receiverFriends.value.map((friend) => friend.id)).toContain(sender.id);
  });

  it("declines requests without creating friends", async () => {
    const [sender, receiver] = await createPair(repo);

    await repo.sendFriendRequest(sender.id, receiver.id);
    const declined = await repo.declineFriendRequest(receiver.id, sender.id);
    expect(declined.ok).toBe(true);
    if (declined.ok) {
      expect(declined.value).toBe(true);
    }

    const receiverAfterDecline = await repo.findById(receiver.id);
    const senderFriends = await repo.getFriendList(sender.id);

    expect(receiverAfterDecline.ok && receiverAfterDecline.value?.ingoingFriendRequests).not.toContain(sender.id);
    expect(senderFriends.ok && senderFriends.value).toHaveLength(0);
  });

  it("removes friendships from both users", async () => {
    const [sender, receiver] = await createPair(repo);

    await repo.sendFriendRequest(sender.id, receiver.id);
    await repo.acceptFriendRequest(receiver.id, sender.id);

    const removed = await repo.removeFriend(sender.id, receiver.id);
    expect(removed.ok).toBe(true);
    if (removed.ok) {
      expect(removed.value).toBe(true);
    }

    const senderFriends = await repo.getFriendList(sender.id);
    const receiverFriends = await repo.getFriendList(receiver.id);

    expect(senderFriends.ok && senderFriends.value).toHaveLength(0);
    expect(receiverFriends.ok && receiverFriends.value).toHaveLength(0);
  });
});
