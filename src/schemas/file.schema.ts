import { z } from "zod";

const objectIdRegex = /^[a-f\d]{24}$/i;

export const fileIdParamsSchema = z.object({
  id: z.string().regex(objectIdRegex, "Invalid file ID"),
});

export type FileIdParams = z.infer<typeof fileIdParamsSchema>;
