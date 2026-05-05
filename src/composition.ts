import { CreateAdminUserService } from "./auth/AdminUserService";
import { CreateAuthController } from "./auth/AuthController";
import { CreateAuthService } from "./auth/AuthService";
import { CreatePrismaUserRepository } from "./auth/PrismaUserRepository";
import { CreatePasswordHasher } from "./auth/PasswordHasher";
import { CreateApp } from "./app";
import type { IApp } from "./contracts";
import { CreateLoggingService } from "./service/LoggingService";
import type { ILoggingService } from "./service/LoggingService";
import { CreatePrismaEventRepository } from "./repository/PrismaEventRepository";
import { CreatePrismaCommentRepository } from "./repository/PrismaCommentRepository";
import { CreateEventService } from "./service/EventService";
import { CreateController } from "./controller/EventController";
import { CommentService } from "./service/CommentService";
import { CommentController } from "./controller/CommentController";
import { InMemoryCommentRepository } from "./repository/InMemoryCommentRepository";
import { CreateInMemoryEventRepository } from "./repository/InMemoryEventRepository";

const usePrismaRepo = true; // Toggle this to switch between in-memory and Prisma repositories

export function createComposedApp(logger?: ILoggingService): IApp {
  const resolvedLogger = logger ?? CreateLoggingService();

  // Authentication & authorization wiring
  const authUsers = CreatePrismaUserRepository();
  const passwordHasher = CreatePasswordHasher();
  const authService = CreateAuthService(authUsers, passwordHasher);
  const adminUserService = CreateAdminUserService(authUsers, passwordHasher);
  const authController = CreateAuthController(authService, adminUserService, resolvedLogger);

  const eventRepo = usePrismaRepo ? CreatePrismaEventRepository() : CreateInMemoryEventRepository();
  const eventService = CreateEventService(eventRepo);
  const eventController = CreateController(eventService, resolvedLogger, adminUserService);

  const commentRepo = usePrismaRepo ? CreatePrismaCommentRepository() : new InMemoryCommentRepository();
  const commentService = new CommentService(commentRepo, eventRepo);
  const commentController = new CommentController(commentService, resolvedLogger, adminUserService, eventService);

  return CreateApp(authController, eventController, commentController, resolvedLogger);
}
