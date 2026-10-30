import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .startsWith("mysql://", "must be a mysql:// URL (this project uses MySQL only)"),
  JWT_SECRET: z.string().min(32, "must be at least 32 characters"),
  FILE_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "must be exactly 64 hex characters (32 bytes for AES-256)"),
  UPLOAD_DIR: z.string().min(1).default("uploads"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/** Validates on first use. Called at startup from instrumentation.ts. */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${problems}\nSee .env.example.`);
  }
  cached = parsed.data;
  return cached;
}
