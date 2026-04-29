import { CreateAdminUserService } from "./auth/AdminUserService";
import { CreateAuthController } from "./auth/AuthController";
import { CreateAuthService } from "./auth/AuthService";
import { CreateInMemoryUserRepository } from "./auth/InMemoryUserRepository";
import { CreatePasswordHasher } from "./auth/PasswordHasher";
import { CreateApp } from "./app";
import type { IApp } from "./contracts";
import { CreateLoggingService } from "./service/LoggingService";
import type { ILoggingService } from "./service/LoggingService";
import { CreateInMemoryEventRepository } from "./repository/InMemoryEventRepository";
import { InMemoryCommentRepository } from "./repository/InMemoryCommentRepository";
import { CreatePrismaEventRepository } from "./repository/PrismaEventRepository";
import { CreatePrismaCommentRepository } from "./repository/PrismaCommentRepository";
import { CreateEventService } from "./service/EventService";
import { CreateController } from "./controller/EventController";
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

  const useInMemoryRepositories = process.env.NODE_ENV === "test";

  const eventRepo = useInMemoryRepositories
    ? CreateInMemoryEventRepository()
    : CreatePrismaEventRepository();
  const eventService = CreateEventService(eventRepo);
  const eventController = CreateController(eventService, resolvedLogger, adminUserService);

  const commentRepo = useInMemoryRepositories
    ? new InMemoryCommentRepository()
    : CreatePrismaCommentRepository();
  const commentService = new CommentService(commentRepo, eventRepo);
  const commentController = new CommentController(commentService, resolvedLogger, adminUserService, eventService);

  return CreateApp(authController, eventController, commentController, resolvedLogger);
}
