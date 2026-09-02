import type { ZodType } from "zod";

export type ChatRole = "user" | "assistant" | "system";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type GenerateStructuredInput<T> = {
  system: string;
  messages: ChatMessage[];
  schema: ZodType<T>;
  /** Observability label for the LLM call site (e.g. classify_intent). */
  callSite?: string;
};

export interface LlmProvider {
  readonly name: string;
  generateStructured<T>(input: GenerateStructuredInput<T>): Promise<T>;
}
