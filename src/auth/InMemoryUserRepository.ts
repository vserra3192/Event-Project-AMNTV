import { Err, Ok, type Result } from "../lib/result";
import { UnexpectedDependencyError, type AuthError } from "./errors";
import type { IUserRepository } from "./UserRepository";
import type { IUserRecord } from "./User";

export const DEMO_USERS: IUserRecord[] = [
  {
    id: "user-admin",
    email: "admin@app.test",
    displayName: "Avery Admin",
    role: "admin",
    freindsList: [],
    outgoingFriendRequests: [],
    ingoingFriendRequests: [],
    outgoingEventInvites: [],
    incomingEventInvites: [],
    passwordHash:
      "52bd54710a468b70e447a45d4e6cfae3:ff273e3cdedbc54045ac368d1f1955e4f6f6e177d63df6fb72440e4045cf756a6f93d16710b2542c725755d9df4960977204f4b580ce184f6242419b659973bf",
  },
  {
    id: "user-staff",
    email: "staff@app.test",
    displayName: "Sam Staff",
    role: "staff",
    freindsList: [],
    outgoingFriendRequests: [],
    ingoingFriendRequests: [],
    outgoingEventInvites: [],
    incomingEventInvites: [],
    passwordHash:
      "5e12e1f3a75b4c2300e26eaaeda137a7:32dcbbe1d8785ced8009479e0705325bc5c425f8b69cd6c4abd6298aca4468d5564cdfaf9b8a02efa330a9d7d80e885842185ca29b5415f5c7e11b1e467324f7",
  },
  {
    id: "user-reader",
    email: "user@app.test",
    displayName: "Una User",
    role: "user",
    freindsList: [],
    outgoingFriendRequests: [],
    ingoingFriendRequests: [],
    outgoingEventInvites: [],
    incomingEventInvites: [],
    passwordHash:
      "2b3bbad4e6798f50a57dba85090dcf6b:9ff6bd0f903e8df9fec42b869554f2bdcfa373690da56432623b82b0173aaf9371716d7fee6734e7080bd3021ed18af49ce723081e20180abdd2d0835f44d301",
  },
];

class InMemoryUserRepository implements IUserRepository {
  constructor(private readonly users: IUserRecord[]) {}

  private findUser(id: string): IUserRecord | null {
    return this.users.find((user) => user.id === id) ?? null;
  }

  private cloneUser(user: IUserRecord): IUserRecord {
    return {
      ...user,
      freindsList: [...user.freindsList],
      outgoingFriendRequests: [...user.outgoingFriendRequests],
      ingoingFriendRequests: [...user.ingoingFriendRequests],
      outgoingEventInvites: user.outgoingEventInvites.map((invite) => ({ ...invite })),
      incomingEventInvites: user.incomingEventInvites.map((invite) => ({ ...invite })),
    };
  }

  async findByEmail(email: string): Promise<Result<IUserRecord | null, AuthError>> {
    try {
      const match = this.users.find((user) => user.email === email) ?? null;
      return Ok(match ? this.cloneUser(match) : null);
    } catch {
      return Err(UnexpectedDependencyError("Unable to read the demo users."));
    }
  }

  async findById(id: string): Promise<Result<IUserRecord | null, AuthError>> {
    try {
      const match = this.findUser(id);
      return Ok(match ? this.cloneUser(match) : null);
    } catch {
      return Err(UnexpectedDependencyError("Unable to read the demo users."));
    }
  }

  async listUsers(): Promise<Result<IUserRecord[], AuthError>> {
    try {
      return Ok(this.users.map((user) => this.cloneUser(user)));
    } catch {
      return Err(UnexpectedDependencyError("Unable to list users."));
    }
  }

  async createUser(user: IUserRecord): Promise<Result<IUserRecord, AuthError>> {
    try {
      const created = this.cloneUser(user);
      this.users.push(created);
      return Ok(this.cloneUser(created));
    } catch {
      return Err(UnexpectedDependencyError("Unable to create the user."));
    }
  }

  async deleteUser(id: string): Promise<Result<boolean, AuthError>> {
    try {
      const index = this.users.findIndex((user) => user.id === id);
      if (index === -1) {
        return Ok(false);
      }

      this.users.splice(index, 1);
      for (const user of this.users) {
        user.freindsList = user.freindsList.filter((friendId) => friendId !== id);
        user.outgoingFriendRequests = user.outgoingFriendRequests.filter((requestId) => requestId !== id);
        user.ingoingFriendRequests = user.ingoingFriendRequests.filter((requestId) => requestId !== id);
        user.outgoingEventInvites = user.outgoingEventInvites.filter((invite) => invite.recipientId !== id);
        user.incomingEventInvites = user.incomingEventInvites.filter((invite) => invite.senderId !== id);
      }
      return Ok(true);
    } catch {
      return Err(UnexpectedDependencyError("Unable to delete the user."));
    }
  }

  async sendFriendRequest(fromUserId: string, toUserId: string): Promise<Result<boolean, AuthError>> {
    try {
      if (fromUserId === toUserId) {
        return Ok(false);
      }

      const sender = this.findUser(fromUserId);
      const receiver = this.findUser(toUserId);
      if (!sender || !receiver) {
        return Ok(false);
      }

      if (sender.freindsList.includes(toUserId)) {
        return Ok(false);
      }

      if (sender.ingoingFriendRequests.includes(toUserId)) {
        return this.acceptFriendRequest(fromUserId, toUserId);
      }

      if (!sender.outgoingFriendRequests.includes(toUserId)) {
        sender.outgoingFriendRequests.push(toUserId);
      }

      if (!receiver.ingoingFriendRequests.includes(fromUserId)) {
        receiver.ingoingFriendRequests.push(fromUserId);
      }

      return Ok(true);
    } catch {
      return Err(UnexpectedDependencyError("Unable to send friend request."));
    }
  }

  async acceptFriendRequest(userId: string, requesterId: string): Promise<Result<boolean, AuthError>> {
    try {
      const user = this.findUser(userId);
      const requester = this.findUser(requesterId);
      if (!user || !requester || !user.ingoingFriendRequests.includes(requesterId)) {
        return Ok(false);
      }

      user.ingoingFriendRequests = user.ingoingFriendRequests.filter((id) => id !== requesterId);
      requester.outgoingFriendRequests = requester.outgoingFriendRequests.filter((id) => id !== userId);

      if (!user.freindsList.includes(requesterId)) {
        user.freindsList.push(requesterId);
      }

      if (!requester.freindsList.includes(userId)) {
        requester.freindsList.push(userId);
      }

      return Ok(true);
    } catch {
      return Err(UnexpectedDependencyError("Unable to accept friend request."));
    }
  }

  async declineFriendRequest(userId: string, requesterId: string): Promise<Result<boolean, AuthError>> {
    try {
      const user = this.findUser(userId);
      const requester = this.findUser(requesterId);
      if (!user || !requester || !user.ingoingFriendRequests.includes(requesterId)) {
        return Ok(false);
      }

      user.ingoingFriendRequests = user.ingoingFriendRequests.filter((id) => id !== requesterId);
      requester.outgoingFriendRequests = requester.outgoingFriendRequests.filter((id) => id !== userId);

      return Ok(true);
    } catch {
      return Err(UnexpectedDependencyError("Unable to decline friend request."));
    }
  }

  async getFriendList(userId: string): Promise<Result<IUserRecord[], AuthError>> {
    try {
      const user = this.findUser(userId);
      if (!user) {
        return Ok([]);
      }

      const friends = user.freindsList
        .map((friendId) => this.findUser(friendId))
        .filter((friend): friend is IUserRecord => friend !== null)
        .map((friend) => this.cloneUser(friend));

      return Ok(friends);
    } catch {
      return Err(UnexpectedDependencyError("Unable to list friends."));
    }
  }

  async removeFriend(userId: string, friendId: string): Promise<Result<boolean, AuthError>> {
    try {
      const user = this.findUser(userId);
      const friend = this.findUser(friendId);
      if (!user || !friend || !user.freindsList.includes(friendId)) {
        return Ok(false);
      }

      user.freindsList = user.freindsList.filter((id) => id !== friendId);
      friend.freindsList = friend.freindsList.filter((id) => id !== userId);

      return Ok(true);
    } catch {
      return Err(UnexpectedDependencyError("Unable to remove friend."));
    }
  }
}

export function CreateInMemoryUserRepository(): IUserRepository {
  // We keep users in memory in this lecture so students can focus on auth, authorization,
  // and hashing before adding a persistent user store.
  return new InMemoryUserRepository([...DEMO_USERS]);
}
