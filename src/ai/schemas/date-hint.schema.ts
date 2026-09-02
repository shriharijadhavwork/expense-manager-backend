import { z } from "zod";

export const dateHintSchema = z.enum([
  "today",
  "yesterday",
  "day_before_yesterday",
  "this_week",
  "last_week",
]);

export type DateHint = z.infer<typeof dateHintSchema>;
