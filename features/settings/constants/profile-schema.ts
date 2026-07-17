import { z } from "zod";
import { MAX_SUGGESTION_CAP } from "@/shared/constants";
import { LANGUAGE_BY_CODE, type LanguageCode } from "./index";

const LANGUAGE_CODES = Object.keys(LANGUAGE_BY_CODE) as [LanguageCode, ...LanguageCode[]];

export const profileUpdateSchema = z
  .object({
    name: z.string().trim().max(100).optional(),
    email: z.union([z.string().email(), z.literal("")]).optional(),
    preferredLanguage: z.enum(LANGUAGE_CODES).optional(),
    maxSuggestions: z
      .union([z.number().int().min(1).max(MAX_SUGGESTION_CAP), z.null()])
      .optional(),
    reviewerCount: z.union([z.literal(1), z.literal(2)]).optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "No profile fields were provided",
  });

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
