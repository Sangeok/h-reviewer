"use server";

import * as z from "zod";
import { requireAuthSession } from "@/lib/server-utils";
import prisma from "@/lib/db";
import {
  disconnectRepository as repoDisconnectRepository,
  disconnectAllRepositoriesInternal,
} from "@/module/repository/actions";
import { DEFAULT_LANGUAGE, type LanguageCode } from "../constants";
import { normalizeLanguageCode } from "../lib/language";
import type { UserProfile, UpdateProfileResult } from "../types";

const updateProfileSchema = z.object({
  name: z.string().trim().max(100).optional(),
  email: z.union([z.email(), z.literal("")]).optional(),
  preferredLanguage: z.string().optional(),
});

export async function getUserProfile(): Promise<UserProfile> {
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
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  return {
    ...user,
    preferredLanguage: normalizeLanguageCode(user.preferredLanguage) ?? DEFAULT_LANGUAGE,
  };
}

export async function updateUserProfile(
  data: { name?: string; email?: string; preferredLanguage?: string }
): Promise<UpdateProfileResult> {
  try {
    const session = await requireAuthSession();

    const parsed = updateProfileSchema.safeParse(data);
    if (!parsed.success) {
      return {
        success: false,
        message: parsed.error.issues[0]?.message ?? "Invalid input",
      };
    }

    const updateData: { name?: string; email?: string; preferredLanguage?: LanguageCode } = {};

    if (typeof parsed.data.name === "string") {
      updateData.name = parsed.data.name;
    }

    if (typeof parsed.data.email === "string") {
      updateData.email = parsed.data.email;
    }

    if (typeof parsed.data.preferredLanguage === "string") {
      const normalizedLanguage = normalizeLanguageCode(parsed.data.preferredLanguage);

      if (!normalizedLanguage) {
        return {
          success: false,
          message: "Invalid language code",
        };
      }

      updateData.preferredLanguage = normalizedLanguage;
    }

    if (Object.keys(updateData).length === 0) {
      return {
        success: false,
        message: "No profile fields were provided",
      };
    }

    const updatedUser = await prisma.user.update({
      where: {
        id: session.user.id,
      },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        preferredLanguage: true,
      },
    });

    return {
      success: true,
      user: updatedUser,
    };
  } catch (error) {
    console.error("Error updating user profile:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to update profile",
    };
  }
}

export async function getConnectedRepositories(): Promise<
  Array<{ id: string; name: string; fullName: string; url: string; createdAt: Date }>
> {
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

export async function disconnectRepository(repositoryId: string): Promise<{ success: true; message: string }> {
  const session = await requireAuthSession();
  await repoDisconnectRepository(repositoryId, session.user.id);
  return { success: true, message: "Repository disconnected successfully" };
}

export async function disconnectRepositoriesAndResetUsage(): Promise<{ success: true; message: string }> {
  const session = await requireAuthSession();
  await disconnectAllRepositoriesInternal(session.user.id);
  return { success: true, message: "All repositories disconnected successfully" };
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

    const normalizedLanguage = normalizeLanguageCode(user?.preferredLanguage);
    if (normalizedLanguage) {
      return normalizedLanguage;
    }

    return DEFAULT_LANGUAGE;
  } catch (error) {
    console.error("Error fetching user language by user id:", error);
    return DEFAULT_LANGUAGE;
  }
}
