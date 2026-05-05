import type { Response } from "express";
import { Err, Ok, type Result } from "../lib/result";
import type { IAppBrowserSession } from "../session/AppSession";
import type { ILoggingService } from "../service/LoggingService";
import {
  UnexpectedDependencyError,
  UserNotFound,
  ValidationError,
  type AuthError,
} from "./errors";
import type { IUserRecord } from "./User";
import type { IUserRepository } from "./UserRepository";

export interface FriendsViewModel {
  currentUser: IUserRecord;
  friends: IUserRecord[];
  incomingRequests: IUserRecord[];
  outgoingRequests: IUserRecord[];
  searchResults: IUserRecord[];
  query: string;
  notice: string | null;
  pageError: string | null;
}

export interface IFriendsController {
  showFriendsPage(
    res: Response,
    session: IAppBrowserSession,
    currentUserId: string,
  ): Promise<void>;
  searchUsers(
    res: Response,
    session: IAppBrowserSession,
    currentUserId: string,
    query: string,
  ): Promise<void>;
  sendFriendRequest(
    res: Response,
    session: IAppBrowserSession,
    currentUserId: string,
    targetUserId: string,
  ): Promise<void>;
  acceptFriendRequest(
    res: Response,
    session: IAppBrowserSession,
    currentUserId: string,
    requesterId: string,
  ): Promise<void>;
  declineFriendRequest(
    res: Response,
    session: IAppBrowserSession,
    currentUserId: string,
    requesterId: string,
  ): Promise<void>;
  removeFriend(
    res: Response,
    session: IAppBrowserSession,
    currentUserId: string,
    friendId: string,
  ): Promise<void>;
}

class FriendsController implements IFriendsController {
  constructor(
    private readonly users: IUserRepository,
    private readonly logger: ILoggingService,
  ) {}

  private mapErrorStatus(error: AuthError): number {
    if (error.name === "UserNotFound") return 404;
    if (error.name === "UserAlreadyExists") return 409;
    if (error.name === "ProtectedUserOperation") return 409;
    if (error.name === "ValidationError") return 400;
    if (error.name === "AuthorizationRequired") return 403;
    if (error.name === "AuthenticationRequired") return 401;
    return 500;
  }

  private async buildViewModel(
    currentUserId: string,
    query = "",
    notice: string | null = null,
    pageError: string | null = null,
  ): Promise<Result<FriendsViewModel, AuthError>> {
    const currentUserResult = await this.users.findById(currentUserId);
    if (currentUserResult.ok === false) {
      return Err(UnexpectedDependencyError(currentUserResult.value.message));
    }

    if (!currentUserResult.value) {
      return Err(UserNotFound("User not found."));
    }

    const friendsResult = await this.users.getFriendList(currentUserId);
    if (friendsResult.ok === false) {
      return Err(UnexpectedDependencyError(friendsResult.value.message));
    }

    const allUsersResult = await this.users.listUsers();
    if (allUsersResult.ok === false) {
      return Err(UnexpectedDependencyError(allUsersResult.value.message));
    }

    const currentUser = currentUserResult.value;
    const usersById = new Map(allUsersResult.value.map((user) => [user.id, user]));
    const incomingRequests = currentUser.ingoingFriendRequests
      .map((requesterId) => usersById.get(requesterId))
      .filter((user): user is IUserRecord => user !== undefined);
    const outgoingRequests = currentUser.outgoingFriendRequests
      .map((recipientId) => usersById.get(recipientId))
      .filter((user): user is IUserRecord => user !== undefined);
    const normalizedQuery = query.trim().toLowerCase();
    const excludedIds = new Set([
      currentUser.id,
      ...currentUser.freindsList,
      ...currentUser.outgoingFriendRequests,
      ...currentUser.ingoingFriendRequests,
    ]);
    const searchResults =
      normalizedQuery.length < 2
        ? []
        : allUsersResult.value.filter((user) => {
            if (excludedIds.has(user.id)) {
              return false;
            }

            return (
              user.displayName.toLowerCase().includes(normalizedQuery) ||
              user.email.toLowerCase().includes(normalizedQuery)
            );
          });

    return Ok({
      currentUser,
      friends: friendsResult.value,
      incomingRequests,
      outgoingRequests,
      searchResults,
      query,
      notice,
      pageError,
    });
  }

  private async renderFriendsPage(
    res: Response,
    session: IAppBrowserSession,
    currentUserId: string,
    query = "",
    notice: string | null = null,
    pageError: string | null = null,
  ): Promise<void> {
    const model = await this.buildViewModel(currentUserId, query, notice, pageError);
    if (model.ok === false) {
      const status = this.mapErrorStatus(model.value);
      res.status(status).render("friends/index", {
        session,
        view: null,
        pageError: model.value.message,
      });
      return;
    }

    res.render("friends/index", {
      session,
      view: model.value,
      pageError,
    });
  }

  private async renderFriendsWorkspace(
    res: Response,
    session: IAppBrowserSession,
    currentUserId: string,
    query = "",
    notice: string | null = null,
    pageError: string | null = null,
    status = 200,
  ): Promise<void> {
    const model = await this.buildViewModel(currentUserId, query, notice, pageError);
    if (model.ok === false) {
      res.status(this.mapErrorStatus(model.value)).render("partials/error", {
        message: model.value.message,
        layout: false,
      });
      return;
    }

    res.status(status).render("friends/partials/workspace", {
      session,
      view: model.value,
      layout: false,
    });
  }

  private async ensureTargetUser(
    currentUser: IUserRecord,
    targetUserId: string,
  ): Promise<Result<IUserRecord, AuthError>> {
    if (!targetUserId.trim()) {
      return Err(ValidationError("User ID is required."));
    }

    if (targetUserId === currentUser.id) {
      return Err(ValidationError("You cannot send a friend request to yourself."));
    }

    const targetResult = await this.users.findById(targetUserId);
    if (targetResult.ok === false) {
      return Err(UnexpectedDependencyError(targetResult.value.message));
    }

    if (!targetResult.value) {
      return Err(UserNotFound("User not found."));
    }

    return Ok(targetResult.value);
  }

  async showFriendsPage(
    res: Response,
    session: IAppBrowserSession,
    currentUserId: string,
  ): Promise<void> {
    await this.renderFriendsPage(res, session, currentUserId);
  }

  async searchUsers(
    res: Response,
    session: IAppBrowserSession,
    currentUserId: string,
    query: string,
  ): Promise<void> {
    const trimmed = query.trim();
    const pageError =
      trimmed.length > 0 && trimmed.length < 2
        ? "Search must be at least 2 characters."
        : null;

    await this.renderFriendsWorkspace(res, session, currentUserId, query, null, pageError);
  }

  async sendFriendRequest(
    res: Response,
    session: IAppBrowserSession,
    currentUserId: string,
    targetUserId: string,
  ): Promise<void> {
    const currentUserResult = await this.users.findById(currentUserId);
    if (currentUserResult.ok === false || !currentUserResult.value) {
      const error = currentUserResult.ok === false
        ? UnexpectedDependencyError(currentUserResult.value.message)
        : UserNotFound("User not found.");
      await this.renderFriendsWorkspace(res, session, currentUserId, "", null, error.message, this.mapErrorStatus(error));
      return;
    }

    const targetResult = await this.ensureTargetUser(currentUserResult.value, targetUserId);
    if (targetResult.ok === false) {
      const status = this.mapErrorStatus(targetResult.value);
      this.logger.warn(`Friend request failed: ${targetResult.value.message}`);
      await this.renderFriendsWorkspace(res, session, currentUserId, "", null, targetResult.value.message, status);
      return;
    }

    if (currentUserResult.value.freindsList.includes(targetUserId)) {
      await this.renderFriendsWorkspace(res, session, currentUserId, "", null, "You are already friends.", 409);
      return;
    }

    if (currentUserResult.value.outgoingFriendRequests.includes(targetUserId)) {
      await this.renderFriendsWorkspace(res, session, currentUserId, "", null, "Friend request already sent.", 409);
      return;
    }

    const result = await this.users.sendFriendRequest(currentUserId, targetUserId);
    if (result.ok === false) {
      await this.renderFriendsWorkspace(res, session, currentUserId, "", null, result.value.message, this.mapErrorStatus(result.value));
      return;
    }

    this.logger.info(`Sent friend request from ${currentUserId} to ${targetUserId}`);
    const message = currentUserResult.value.ingoingFriendRequests.includes(targetUserId)
      ? `Accepted ${targetResult.value.displayName}'s friend request.`
      : `Sent ${targetResult.value.displayName} a friend request.`;
    await this.renderFriendsWorkspace(res, session, currentUserId, "", message);
  }

  async acceptFriendRequest(
    res: Response,
    session: IAppBrowserSession,
    currentUserId: string,
    requesterId: string,
  ): Promise<void> {
    const result = await this.users.acceptFriendRequest(currentUserId, requesterId);
    if (result.ok === false) {
      await this.renderFriendsWorkspace(res, session, currentUserId, "", null, result.value.message, this.mapErrorStatus(result.value));
      return;
    }

    if (!result.value) {
      await this.renderFriendsWorkspace(res, session, currentUserId, "", null, "Friend request not found.", 404);
      return;
    }

    this.logger.info(`Accepted friend request from ${requesterId} for ${currentUserId}`);
    await this.renderFriendsWorkspace(res, session, currentUserId, "", "Friend request accepted.");
  }

  async declineFriendRequest(
    res: Response,
    session: IAppBrowserSession,
    currentUserId: string,
    requesterId: string,
  ): Promise<void> {
    const result = await this.users.declineFriendRequest(currentUserId, requesterId);
    if (result.ok === false) {
      await this.renderFriendsWorkspace(res, session, currentUserId, "", null, result.value.message, this.mapErrorStatus(result.value));
      return;
    }

    if (!result.value) {
      await this.renderFriendsWorkspace(res, session, currentUserId, "", null, "Friend request not found.", 404);
      return;
    }

    this.logger.info(`Declined friend request from ${requesterId} for ${currentUserId}`);
    await this.renderFriendsWorkspace(res, session, currentUserId, "", "Friend request declined.");
  }

  async removeFriend(
    res: Response,
    session: IAppBrowserSession,
    currentUserId: string,
    friendId: string,
  ): Promise<void> {
    const result = await this.users.removeFriend(currentUserId, friendId);
    if (result.ok === false) {
      await this.renderFriendsWorkspace(res, session, currentUserId, "", null, result.value.message, this.mapErrorStatus(result.value));
      return;
    }

    if (!result.value) {
      await this.renderFriendsWorkspace(res, session, currentUserId, "", null, "Friend not found.", 404);
      return;
    }

    this.logger.info(`Removed friend ${friendId} for ${currentUserId}`);
    await this.renderFriendsWorkspace(res, session, currentUserId, "", "Friend removed.");
  }
}

export function CreateFriendsController(
  users: IUserRepository,
  logger: ILoggingService,
): IFriendsController {
  return new FriendsController(users, logger);
}
