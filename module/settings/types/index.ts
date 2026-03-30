import type { LanguageCode } from "../constants";

export interface UserProfile {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  createdAt: Date;
  preferredLanguage: LanguageCode;
}

export type UpdateProfileResult =
  | {
      success: true;
      user: { id: string; name: string | null; email: string | null; preferredLanguage: string | null };
    }
  | { success: false; message: string };
