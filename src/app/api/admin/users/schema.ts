import { Role } from "@prisma/client";
import { z } from "zod";

export const createUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email required"),
  githubId: z.string().trim().min(1, "GitHub ID must not be empty").optional(),
  role: z.nativeEnum(Role).default(Role.MEMBER),
});

export const updateUserSchema = z
  .object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    githubId: z.string().trim().min(1).optional().nullable(),
    role: z.nativeEnum(Role).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });
