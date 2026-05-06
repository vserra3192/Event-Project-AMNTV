import type { Result } from "../lib/result";
import type { AuthError } from "./errors";
import type { IUserRecord } from "./User";

export interface IUserRepository {
  findByEmail(email: string): Promise<Result<IUserRecord | null, AuthError>>;
  findById(id: string): Promise<Result<IUserRecord | null, AuthError>>;
  listUsers(): Promise<Result<IUserRecord[], AuthError>>;
  createUser(user: IUserRecord): Promise<Result<IUserRecord, AuthError>>;
  deleteUser(id: string): Promise<Result<boolean, AuthError>>;
  sendFriendRequest(fromUserId: string, toUserId: string): Promise<Result<boolean, AuthError>>;
  acceptFriendRequest(userId: string, requesterId: string): Promise<Result<boolean, AuthError>>;
  declineFriendRequest(userId: string, requesterId: string): Promise<Result<boolean, AuthError>>;
  getFriendList(userId: string): Promise<Result<IUserRecord[], AuthError>>;
  removeFriend(userId: string, friendId: string): Promise<Result<boolean, AuthError>>;
  sendEventInvite(eventId: number, senderId: string, recipientId: string): Promise<Result<boolean, AuthError>>;
  removeEventInvite(eventId: number, recipientId: string): Promise<Result<boolean, AuthError>>;
}
