import prisma from '../services/db.js';

export class UserRepository {
  async upsertGitHubUser(data: {
    githubId: string;
    login: string;
    name?: string;
    email?: string;
    avatarUrl?: string;
  }) {
    return prisma.user.upsert({
      where: { login: data.login },
      create: {
        githubId: data.githubId,
        login: data.login,
        name: data.name,
        email: data.email,
        avatarUrl: data.avatarUrl,
      },
      update: {
        githubId: data.githubId,
        name: data.name,
        email: data.email,
        avatarUrl: data.avatarUrl,
      },
    });
  }

  async upsertGoogleUser(data: {
    googleId: string;
    login: string;
    name?: string;
    email?: string;
    avatarUrl?: string;
  }) {
    return prisma.user.upsert({
      where: { login: data.login },
      create: {
        googleId: data.googleId,
        login: data.login,
        name: data.name,
        email: data.email,
        avatarUrl: data.avatarUrl,
      },
      update: {
        googleId: data.googleId,
        name: data.name,
        email: data.email,
        avatarUrl: data.avatarUrl,
      },
    });
  }

  async getUserByLogin(login: string) {
    return prisma.user.findUnique({
      where: { login },
    });
  }
}

export default new UserRepository();
