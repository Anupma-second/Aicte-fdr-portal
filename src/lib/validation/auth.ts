import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(191),
  // bcrypt only reads the first 72 bytes; the cap also bounds hashing work.
  password: z.string().min(1).max(72),
});

const strongPassword = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(72)
  .regex(/[a-z]/, "Add a lowercase letter")
  .regex(/[A-Z]/, "Add an uppercase letter")
  .regex(/[0-9]/, "Add a number");

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(72),
  newPassword: strongPassword,
});

export const registerSchema = z.object({
  institutionName: z.string().trim().min(3).max(200),
  aicteCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{4,30}$/, "Use 4 to 30 letters, digits or hyphens"),
  institutionType: z.enum(["ENGINEERING", "MANAGEMENT", "PHARMACY", "ARCHITECTURE", "POLYTECHNIC", "OTHER"]),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(60),
  region: z.enum(["NORTH", "SOUTH", "EAST", "WEST", "CENTRAL", "NORTH_EAST"]),
  name: z.string().trim().min(2).max(120),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\- ]{7,20}$/, "Enter a valid phone number")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  email: z.string().trim().toLowerCase().email().max(191),
  password: strongPassword,
});

export const adminUpdateUserSchema = z
  .object({
    status: z.enum(["ACTIVE", "SUSPENDED", "REJECTED"]).optional(),
    role: z.enum(["SCRUTINY_OFFICER", "COMPETENT_AUTHORITY", "ADMIN"]).optional(),
  })
  .refine((value) => value.status || value.role, "Nothing to change");

export const adminCreateUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(191),
  role: z.enum(["SCRUTINY_OFFICER", "COMPETENT_AUTHORITY", "ADMIN"]),
});

export type RegisterInput = z.infer<typeof registerSchema>;
