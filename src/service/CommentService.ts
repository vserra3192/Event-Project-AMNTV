import type { UserRole } from '../auth/User';

export type User = {
  userId: String;
  displayName: String;
  role: UserRole;
};