import { Role } from "@prisma/client";

type SerializableUser = {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  isActive: boolean;
  githubId: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
};

export function serializeUser(user: SerializableUser) {
  return {
    id: user.id,
    name: user.name ?? "",
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    githubId: user.githubId ?? "",
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}
