import { z } from "zod";
import { agentIntentSchema } from "./agent-output.schema.js";

export const intentClassificationSchema = z.object({
  intent: agentIntentSchema,
  confidence: z.number().min(0).max(1).optional(),
});

export type IntentClassification = z.infer<typeof intentClassificationSchema>;
