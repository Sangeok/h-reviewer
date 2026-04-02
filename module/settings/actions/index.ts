"use server";

import { requireAuthSession } from "@/lib/server-utils";
import prisma from "@/lib/db";
import {
  disconnectRepository as disconnectRepositoryInternal,
  disconnectAllRepositoriesInternal,
} from "@/module/repository/actions";
import { z } from "zod";
import { DEFAULT_LANGUAGE, LANGUAGE_BY_CODE, type LanguageCode } from "../constants";
import { MAX_SUGGESTION_CAP } from "@/shared/constants";
import { isValidLanguageCode } from "../lib/language";

const LANGUAGE_CODES = Object.keys(LANGUAGE_BY_CODE) as [LanguageCode, ...LanguageCode[]];

const profileUpdateSchema = z
  .object({
    name: z.string().trim().max(100).optional(),
    email: z.union([z.string().email(), z.literal("")]).optional(),
    preferredLanguage: z.enum(LANGUAGE_CODES).optional(),
    maxSuggestions: z
      .union([z.number().int().min(1).max(MAX_SUGGESTION_CAP), z.null()])
      .optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "No profile fields were provided",
  });

type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export async function getUserProfile() {
  try {
    const session = await requireAuthSession();

    const user = await prisma.user.findUnique({
      where: {
        id: session.user.id,
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
        preferredLanguage: true,
        maxSuggestions: true,
      },
    });

    if (!user) {
      return null;
    }

    return {
      ...user,
      preferredLanguage: isValidLanguageCode(user.preferredLanguage) ? user.preferredLanguage : DEFAULT_LANGUAGE,
    };
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return null;
  }
}

export async function updateUserProfile(data: ProfileUpdateInput) {
  try {
    const session = await requireAuthSession();

    const parsed = profileUpdateSchema.safeParse(data);
    if (!parsed.success) {
      return {
        success: false,
        message: parsed.error.issues[0]?.message ?? "Validation failed",
      };
    }

    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: parsed.data,
      select: {
        id: true,
        name: true,
        email: true,
        preferredLanguage: true,
        maxSuggestions: true,
      },
    });

    return { success: true, user: updatedUser };
  } catch (error) {
    console.error("Error updating user profile:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to update profile",
    };
  }
}

export async function getConnectedRepositories() {
  try {
    const session = await requireAuthSession();

    const repositories = await prisma.repository.findMany({
      where: {
        userId: session.user.id,
      },
      select: {
        id: true,
        name: true,
        fullName: true,
        url: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return repositories;
  } catch (error) {
    console.error("Error fetching connected repositories:", error);
    throw error instanceof Error ? error : new Error("Failed to fetch connected repositories");
  }
}

export async function disconnectRepository(repositoryId: string) {
  const session = await requireAuthSession();
  try {
    await disconnectRepositoryInternal(repositoryId, session.user.id);
    return { success: true, message: "Repository disconnected successfully" };
  } catch (error) {
    console.error("Error disconnecting repository:", error);
    throw error instanceof Error ? error : new Error("Failed to disconnect repository");
  }
}

export async function disconnectAllRepositories() {
  const session = await requireAuthSession();
  try {
    await disconnectAllRepositoriesInternal(session.user.id);
    return { success: true, message: "All repositories disconnected successfully" };
  } catch (error) {
    console.error("Error disconnecting all repositories:", error);
    throw error instanceof Error ? error : new Error("Failed to disconnect all repositories");
  }
}

export async function getUserLanguageByUserId(userId: string): Promise<LanguageCode> {
  try {
    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        preferredLanguage: true,
      },
    });

    if (user && isValidLanguageCode(user.preferredLanguage)) {
      return user.preferredLanguage;
    }

    return DEFAULT_LANGUAGE;
  } catch (error) {
    console.error("Error fetching user language by user id:", error);
    return DEFAULT_LANGUAGE;
  }
}