import type { UserRole } from "../auth/User";
import { randomUUID } from "node:crypto";
import type { Session, SessionData } from "express-session";
import type { IAuthenticatedUser } from "../auth/User";

export interface IAuthenticatedUserSession {
  userId: string;
  email: string;
  displayName: string;
  role: UserRole;
  signedInAt: string;
}

export interface IAppBrowserSession {
  browserId: string;
  browserLabel: string;
  visitCount: number;
  createdAt: string;
  lastSeenAt: string;
  authenticatedUser: IAuthenticatedUserSession | null;
  inboxSeenSignature?: string;
}

export type AppSessionStore = Session &
  Partial<SessionData> & {
    app?: IAppBrowserSession;
  };

function createBrowserLabel(browserId: string): string {
  return `Browser ${browserId.slice(0, 4).toUpperCase()}`;
}

export function createInitialAppSession(
  now: Date = new Date(),
  browserId: string = randomUUID(),
): IAppBrowserSession {
  const timestamp = now.toISOString();

  return {
    browserId,
    browserLabel: createBrowserLabel(browserId),
    visitCount: 0,
    createdAt: timestamp,
    lastSeenAt: timestamp,
    authenticatedUser: null,
  };
}

function ensureAppSession(
  store: AppSessionStore,
  now: Date = new Date(),
): IAppBrowserSession {
  if (!store.app) {
    store.app = createInitialAppSession(now);
  }

  return store.app;
}

function snapshotSession(session: IAppBrowserSession): IAppBrowserSession {
  return session;
}

export function recordPageView(
  store: AppSessionStore,
  now: Date = new Date(),
): IAppBrowserSession {
  const session = ensureAppSession(store, now);
  session.visitCount += 1;
  session.lastSeenAt = now.toISOString();
  return snapshotSession(session);
}

export function touchAppSession(
  store: AppSessionStore,
  now: Date = new Date(),
): IAppBrowserSession {
  const session = ensureAppSession(store, now);
  session.lastSeenAt = now.toISOString();
  return snapshotSession(session);
}

// The session stores authenticated identity only; passwords stay out of the session.
export function signInAuthenticatedUser(
  store: AppSessionStore,
  user: IAuthenticatedUser,
  now: Date = new Date(),
): IAppBrowserSession {
  const session = ensureAppSession(store, now);
  session.authenticatedUser = {
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    signedInAt: now.toISOString(),
  };
  session.lastSeenAt = now.toISOString();
  return snapshotSession(session);
}

export function signOutAuthenticatedUser(
  store: AppSessionStore,
  now: Date = new Date(),
): IAppBrowserSession {
  const session = ensureAppSession(store, now);
  session.authenticatedUser = null;
  session.lastSeenAt = now.toISOString();
  return snapshotSession(session);
}

export function getAuthenticatedUser(
  store: AppSessionStore,
  now: Date = new Date(),
): IAuthenticatedUserSession | null {
  return ensureAppSession(store, now).authenticatedUser;
}

export function isAuthenticatedSession(
  store: AppSessionStore,
  now: Date = new Date(),
): boolean {
  return getAuthenticatedUser(store, now) !== null;
}
