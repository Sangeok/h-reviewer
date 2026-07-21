import type { LanguageCode } from "../constants";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  image: string | null;
  createdAt: Date;
  preferredLanguage: LanguageCode;
  maxSuggestions: number | null;
  verificationEnabled: boolean;
}

export type UpdateProfileResult =
  | {
      success: true;
      user: {
        id: string;
        name: string;
        email: string;
        preferredLanguage: string;
        maxSuggestions: number | null;
        verificationEnabled: boolean;
      };
    }
  | { success: false; message: string };

export interface ConnectedRepository {
  id: string;
  name: string;
  fullName: string;
  url: string;
  createdAt: Date;
}
