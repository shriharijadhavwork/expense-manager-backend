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

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(5050),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  JWT_SECRET: z
    .string()
    .min(16, "JWT_SECRET must be at least 16 characters"),
  JWT_EXPIRES_IN: z.string().min(1, "JWT_EXPIRES_IN is required"),
  FRONTEND_URL: z.url("FRONTEND_URL must be a valid URL"),
  CLOUDINARY_CLOUD_NAME: z.string().min(1, "CLOUDINARY_CLOUD_NAME is required"),
  CLOUDINARY_API_KEY: z.string().min(1, "CLOUDINARY_API_KEY is required"),
  CLOUDINARY_API_SECRET: z
    .string()
    .min(1, "CLOUDINARY_API_SECRET is required"),
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
