export type UserRole = "admin" | "staff" | "user";

export interface IUserEventInvite {
  eventId: number;
  senderId: string;
  recipientId: string;
}

export interface IUserRecord {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  passwordHash: string;
  freindsList: string[];
  outgoingFriendRequests: string[];
  ingoingFriendRequests: string[];
  outgoingEventInvites: IUserEventInvite[];
  incomingEventInvites: IUserEventInvite[];
}

export interface IAuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
}

export interface IUserSummary {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
}

export function toAuthenticatedUser(user: IUserRecord): IAuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  };
}

export function toUserSummary(user: IUserRecord): IUserSummary {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  };
}
