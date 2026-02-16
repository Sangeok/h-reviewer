"use server";

import { requireAuthSession } from "@/lib/server-utils";
import prisma from "@/lib/db";
import { deleteWebhook } from "@/module/github";
import { DEFAULT_LANGUAGE, normalizeLanguageCode, type LanguageCode } from "../constants";

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
      },
    });

    if (!user) {
      return null;
    }

    return {
      ...user,
      preferredLanguage: normalizeLanguageCode(user.preferredLanguage) ?? DEFAULT_LANGUAGE,
    };
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return null;
  }
}

export async function updateUserProfile(data: { name?: string; email?: string; preferredLanguage?: string }) {
  try {
    const session = await requireAuthSession();
    const updateData: { name?: string; email?: string; preferredLanguage?: LanguageCode } = {};

    if (typeof data.name === "string") {
      updateData.name = data.name.trim();
    }

    if (typeof data.email === "string") {
      updateData.email = data.email.trim();
    }

    if (typeof data.preferredLanguage === "string") {
      const normalizedLanguage = normalizeLanguageCode(data.preferredLanguage);

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
    return [];
  }
}

export async function deleteRepository(repositoryId: string) {
  try {
    const session = await requireAuthSession();

    const repository = await prisma.repository.findUnique({
      where: {
        id: repositoryId,
        userId: session.user.id,
      },
    });

    if (!repository) {
      throw new Error("Repository not found");
    }

    await deleteWebhook(repository.owner, repository.name);

    await prisma.repository.delete({
      where: {
        id: repositoryId,
        userId: session.user.id,
      },
    });

    return {
      success: true,
      message: "Repository deleted successfully",
    };
  } catch (error) {
    console.error("Error deleting repository:", error);
    return {
      success: false,
      message: "Failed to delete repository",
    };
  }
}

export async function disconnectAllRepositories() {
  try {
    const session = await requireAuthSession();

    const repositories = await prisma.repository.findMany({
      where: {
        userId: session.user.id,
      },
    });

    await Promise.all(
      repositories.map(async (repository) => {
        await deleteWebhook(repository.owner, repository.name);
      })
    );

    await prisma.repository.deleteMany({
      where: {
        userId: session.user.id,
      },
    });

    return {
      success: true,
      message: "All repositories disconnected successfully",
    };
  } catch (error) {
    console.error("Error disconnecting all repositories:", error);
    return {
      success: false,
      message: "Failed to disconnect all repositories",
    };
  }
}

export async function getUserLanguageByUserId(userId: string): Promise<string> {
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
