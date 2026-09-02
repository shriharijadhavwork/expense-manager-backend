import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv({
  path: path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../.env",
  ),
});

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", ""].includes(normalized)) {
      return false;
    }
  }
  return value;
}, z.boolean());

const envSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(5050),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
    JWT_SECRET: z
      .string()
      .min(16, "JWT_SECRET must be at least 16 characters"),
    JWT_EXPIRES_IN: z.string().min(1, "JWT_EXPIRES_IN is required"),
    FRONTEND_URL: z.url("FRONTEND_URL must be a valid URL"),
    CLOUDINARY_CLOUD_NAME: z
      .string()
      .min(1, "CLOUDINARY_CLOUD_NAME is required"),
    CLOUDINARY_API_KEY: z.string().min(1, "CLOUDINARY_API_KEY is required"),
    CLOUDINARY_API_SECRET: z
      .string()
      .min(1, "CLOUDINARY_API_SECRET is required"),
    EMAIL_PROVIDER: z.enum(["console", "smtp", "ses"]).default("console"),
    EMAIL_FROM: z
      .string()
      .trim()
      .min(3, "EMAIL_FROM is required")
      .default("Flux Team <noreply@localhost>"),
    SMTP_HOST: z.string().trim().optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURE: booleanFromEnv.default(false),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    GEMINI_API_KEY: z.string().trim().optional(),
    GEMINI_MODEL: z.string().trim().min(1).default("gemini-2.5-flash"),
    AI_DEBOUNCE_MS: z.coerce.number().int().positive().default(1500),
    AI_LOG_LLM_PAYLOADS: booleanFromEnv.default(false),
    AI_PERSIST_EXECUTIONS: booleanFromEnv.default(true),
  })
  .superRefine((data, ctx) => {
    if (
      data.NODE_ENV === "production" &&
      data.EMAIL_PROVIDER === "console"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_PROVIDER"],
        message:
          "EMAIL_PROVIDER=console is not allowed in production. Set EMAIL_PROVIDER=smtp (or ses when available) and configure delivery.",
      });
    }

    if (data.EMAIL_PROVIDER !== "smtp") {
      return;
    }

    if (!data.SMTP_HOST) {
      ctx.addIssue({
        code: "custom",
        path: ["SMTP_HOST"],
        message: "SMTP_HOST is required when EMAIL_PROVIDER=smtp",
      });
    }

    const hasUser = Boolean(data.SMTP_USER?.trim());
    const hasPass = Boolean(data.SMTP_PASS?.trim());
    if (hasUser !== hasPass) {
      ctx.addIssue({
        code: "custom",
        path: hasUser ? ["SMTP_PASS"] : ["SMTP_USER"],
        message:
          "SMTP_USER and SMTP_PASS must both be set (or both omitted for open local SMTP)",
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("\n");

  console.error("Invalid environment configuration:\n" + details);
  process.exit(1);
}

export const env = parsed.data;

export type Env = typeof env;
