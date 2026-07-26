"use server";

import { requireAuthSession } from "@/lib/server-utils";
import prisma from "@/lib/db";
import {
  disconnectRepository as disconnectRepositoryInternal,
  disconnectAllRepositoriesInternal,
} from "@/features/repository";
import { DEFAULT_LANGUAGE, type LanguageCode } from "../constants";
import { isValidLanguageCode } from "../lib/language";
import { profileUpdateSchema, type ProfileUpdateInput } from "../constants/profile-schema";
import type { UserProfile, UpdateProfileResult, ConnectedRepository } from "../types";

export async function getUserProfile(): Promise<UserProfile | null> {
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
        verificationEnabled: true,
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
    throw error instanceof Error ? error : new Error("Failed to fetch user profile");
  }
}

export async function updateUserProfile(data: ProfileUpdateInput): Promise<UpdateProfileResult> {
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
        verificationEnabled: true,
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

export async function getConnectedRepositories(): Promise<ConnectedRepository[]> {
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

export async function disconnectRepository(repositoryId: string): Promise<void> {
  const session = await requireAuthSession();
  try {
    await disconnectRepositoryInternal(repositoryId, session.user.id);
  } catch (error) {
    console.error("Error disconnecting repository:", error);
    throw error instanceof Error ? error : new Error("Failed to disconnect repository");
  }
}

export async function disconnectAllRepositories(): Promise<void> {
  const session = await requireAuthSession();
  try {
    await disconnectAllRepositoriesInternal(session.user.id);
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
