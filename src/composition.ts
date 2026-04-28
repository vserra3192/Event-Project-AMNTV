import { CreateAdminUserService } from "./auth/AdminUserService";
import { CreateAuthController } from "./auth/AuthController";
import { CreateAuthService } from "./auth/AuthService";
import { CreateInMemoryUserRepository } from "./auth/InMemoryUserRepository";
import { CreatePasswordHasher } from "./auth/PasswordHasher";
import { CreateApp } from "./app";
import type { IApp } from "./contracts";
import { CreateLoggingService } from "./service/LoggingService";
import type { ILoggingService } from "./service/LoggingService";
import { CreatePrismaEventRepository } from "./repository/PrismaEventRepository";
import { CreateEventService } from "./service/EventService";
import { CreateController } from "./controller/EventController";
import { InMemoryCommentRepository } from "./repository/InMemoryCommentRepository";
import { CommentService } from "./service/CommentService";
import { CommentController } from "./controller/CommentController";

export function createComposedApp(logger?: ILoggingService): IApp {
  const resolvedLogger = logger ?? CreateLoggingService();

  // Authentication & authorization wiring
  const authUsers = CreateInMemoryUserRepository();
  const passwordHasher = CreatePasswordHasher();
  const authService = CreateAuthService(authUsers, passwordHasher);
  const adminUserService = CreateAdminUserService(authUsers, passwordHasher);
  const authController = CreateAuthController(authService, adminUserService, resolvedLogger);

  const eventRepo = CreatePrismaEventRepository();
  const eventService = CreateEventService(eventRepo);
  const eventController = CreateController(eventService, resolvedLogger, adminUserService);

  const commentRepo = new InMemoryCommentRepository();
  const commentService = new CommentService(commentRepo, eventRepo);
  const commentController = new CommentController(commentService, resolvedLogger, adminUserService, eventService);

  return CreateApp(authController, eventController, commentController, resolvedLogger);
}
