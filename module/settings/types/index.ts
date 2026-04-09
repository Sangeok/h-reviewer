import type { LanguageCode } from "../constants";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  image: string | null;
  createdAt: Date;
  preferredLanguage: LanguageCode;
  maxSuggestions: number | null;
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

export interface ActionSuccess {
  success: true;
  message: string;
}
