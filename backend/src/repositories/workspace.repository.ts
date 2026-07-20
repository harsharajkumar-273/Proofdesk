import prisma from '../services/db.js';

export class WorkspaceRepository {
  async saveSession(data: {
    id: string;
    owner: string;
    repo: string;
    branch: string;
    repoPath: string;
    outputPath: string;
    previewPath?: string;
    creatorLogin?: string;
    notifyEmail?: string;
    commitHash?: string;
  }) {
    const creator = data.creatorLogin
      ? await prisma.user.findUnique({ where: { login: data.creatorLogin } })
      : null;

    return prisma.workspaceSession.upsert({
      where: { id: data.id },
      create: {
        id: data.id,
        owner: data.owner,
        repo: data.repo,
        branch: data.branch,
        repoPath: data.repoPath,
        outputPath: data.outputPath,
        previewPath: data.previewPath || null,
        creatorLogin: data.creatorLogin || null,
        notifyEmail: data.notifyEmail || null,
        commitHash: data.commitHash || null,
        creatorId: creator?.id || null,
      },
      update: {
        owner: data.owner,
        repo: data.repo,
        branch: data.branch,
        repoPath: data.repoPath,
        outputPath: data.outputPath,
        previewPath: data.previewPath || null,
        creatorLogin: data.creatorLogin || null,
        notifyEmail: data.notifyEmail || null,
        commitHash: data.commitHash || null,
        creatorId: creator?.id || null,
      },
    });
  }

  async getSession(id: string) {
    return prisma.workspaceSession.findUnique({
      where: { id },
      include: {
        buildLogs: true,
        reviewMarkers: true,
        comments: true,
      },
    });
  }

  async deleteSession(id: string) {
    return prisma.workspaceSession.delete({
      where: { id },
    });
  }

  async createBuildLog(data: {
    sessionId: string;
    status: string;
    xmlId?: string;
    stdout?: string;
    stderr?: string;
    durationMs?: number;
  }) {
    return prisma.buildLog.create({
      data: {
        sessionId: data.sessionId,
        status: data.status,
        xmlId: data.xmlId || null,
        stdout: data.stdout || null,
        stderr: data.stderr || null,
        durationMs: data.durationMs || null,
      },
    });
  }

  async saveReviewMarkers(sessionId: string, markers: Record<string, any[]>) {
    // Flatten markers map from frontend. Frontend structure of review-markers is file-keyed map:
    // { "src/vectors.xml": [ { line, severity, message }, ... ] }
    const flatMarkers: Array<{
      sessionId: string;
      filePath: string;
      line: number;
      severity: string;
      message: string;
    }> = [];

    for (const [filePath, fileMarkers] of Object.entries(markers)) {
      if (Array.isArray(fileMarkers)) {
        for (const marker of fileMarkers) {
          flatMarkers.push({
            sessionId,
            filePath,
            line: Number(marker.line || 1),
            severity: String(marker.severity || 'error'),
            message: String(marker.message || ''),
          });
        }
      }
    }

    await prisma.$transaction([
      prisma.reviewMarker.deleteMany({ where: { sessionId } }),
      prisma.reviewMarker.createMany({
        data: flatMarkers,
      }),
    ]);
  }

  async getReviewMarkers(sessionId: string) {
    const dbMarkers = await prisma.reviewMarker.findMany({
      where: { sessionId },
    });

    // Structure it back to key-value map by file path as expected by frontend
    const markersMap: Record<string, any[]> = {};
    for (const m of dbMarkers) {
      if (!markersMap[m.filePath]) {
        markersMap[m.filePath] = [];
      }
      markersMap[m.filePath].push({
        line: m.line,
        severity: m.severity,
        message: m.message,
      });
    }

    return markersMap;
  }

  // ── Comments CRUD ──

  async getComments(sessionId: string) {
    return prisma.comment.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createComment(data: {
    sessionId: string;
    filePath: string;
    line: number;
    author: string;
    body: string;
  }) {
    return prisma.comment.create({
      data,
    });
  }

  async resolveComment(commentId: string, resolved: boolean) {
    return prisma.comment.update({
      where: { id: commentId },
      data: { resolved },
    });
  }

  async deleteComment(commentId: string) {
    return prisma.comment.delete({
      where: { id: commentId },
    });
  }
}

export default new WorkspaceRepository();
