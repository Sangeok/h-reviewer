"use server";

import { requireAuthSession } from "@/lib/server-utils";
import prisma from "@/lib/db";
import { revalidatePath } from "next/cache";
import { deleteWebhook } from "@/module/github";

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

    return user;
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return null;
  }
}

export async function updateUserProfile(data: { name?: string; email?: string; preferredLanguage?: string }) {
  try {
    const session = await requireAuthSession();

    const updatedUser = await prisma.user.update({
      where: {
        id: session.user.id,
      },
      data: {
        name: data.name,
        email: data.email,
        preferredLanguage: data.preferredLanguage,
      },
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
    return null;
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

    return user?.preferredLanguage ?? "en";
  } catch (error) {
    console.error("Error fetching user language by user id:", error);
    return "en";
  }
}
