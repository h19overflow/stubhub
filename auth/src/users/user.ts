type UserRole = "user" | "admin";

type PublicUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  role: UserRole;
};

export type { PublicUser, UserRole };

