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

  /**
   * Resolve or unresolve a comment, scoped to its session.
   *
   * sessionId is required rather than optional. Keying on commentId alone
   * meant any comment could be addressed by ID from any session -- harmless
   * while nothing calls this, and an IDOR the moment a route is added, with
   * nothing in the signature to suggest a check was ever intended.
   *
   * Scoping by session rather than author is deliberate: any route reaching
   * here is already behind checkWorkspaceOwner, so the session is the
   * boundary that has actually been authorised. Whether a workspace owner may
   * resolve someone else's comment is a separate product decision, and adding
   * an author filter here would answer it by accident.
   *
   * Filtering in the where clause rather than fetching and comparing: a
   * post-fetch check leaks whether the comment exists, and Prisma throws
   * P2025 when nothing matches, which maps cleanly to a 404 covering both
   * "no such comment" and "not in this session".
   */
  async resolveComment(commentId: string, sessionId: string, resolved: boolean) {
    return prisma.comment.update({
      where: { id: commentId, sessionId },
      data: { resolved },
    });
  }

  /** Delete a comment, scoped to its session. See resolveComment. */
  async deleteComment(commentId: string, sessionId: string) {
    return prisma.comment.delete({
      where: { id: commentId, sessionId },
    });
  }
}

export default new WorkspaceRepository();
