import { exec } from "child_process";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const WORKSPACE_ROOT = "/tmp/ila-builds";
const DOCKER_IMAGE = "mra-pretext-builder";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DOCKER_CONTEXT = path.resolve(__dirname, "../../docker");

function run(cmd) {
  return new Promise((resolve, reject) => {
    exec(
      cmd,
      { maxBuffer: 1024 * 1024 * 50 },
      (err, stdout, stderr) => {
        if (err) reject({ stdout, stderr, err });
        else resolve({ stdout, stderr });
      }
    );
  });
}

async function ensureDockerImage() {
  try {
    await run(`docker image inspect ${DOCKER_IMAGE}`);
    return false;
  } catch {
    // Image is missing locally; build it from the checked-in Docker context.
  }

  await run(`docker build -t ${DOCKER_IMAGE} "${DOCKER_CONTEXT}"`);
  return true;
}

export default class RepositoryCompiler {
  constructor() {
    fs.mkdirSync(WORKSPACE_ROOT, { recursive: true });
    this.sessions = new Map();
  }

  /**
   * Clone + build repository using Docker
   */
  async build({ owner, repo }) {
    const sessionId = crypto.randomBytes(8).toString("hex");
    const sessionDir = path.join(WORKSPACE_ROOT, sessionId);
    const repoDir = path.join(sessionDir, "repo");
    const outputDir = path.join(sessionDir, "output");

    fs.mkdirSync(repoDir, { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });

    // Validate owner/repo to prevent shell injection (only allow safe GitHub name chars)
    if (!/^[a-zA-Z0-9_.-]+$/.test(owner) || !/^[a-zA-Z0-9_.-]+$/.test(repo)) {
      throw new Error("Invalid owner or repository name");
    }

    const repoUrl = `https://github.com/${owner}/${repo}.git`;

    // Step 1: clone — quote both URL and destination path
    await run(`git clone --recursive "${repoUrl}" "${repoDir}"`);

    // Step 2: docker build
    const dockerCmd = [
      "docker run --rm",
      `-v "${repoDir}:/repo"`,
      `-v "${outputDir}:/output"`,
      DOCKER_IMAGE
    ].join(" ");

    try {
      await ensureDockerImage();
      const { stdout, stderr } = await run(dockerCmd);

      const artifacts = this.collectArtifacts(outputDir);
      const entry = artifacts.find(a => a.name === "index.html") || artifacts[0];

      this.sessions.set(sessionId, { repoDir, outputDir });

      return {
        success: true,
        sessionId,
        buildType: "scons-html",
        entryFile: entry?.path || null,
        artifacts,
        stdout: stdout.slice(-5000),
        stderr: stderr.slice(-5000)
      };
    } catch (e) {
      return {
        success: false,
        sessionId,
        artifacts: [],
        stdout: e.stdout || "",
        stderr: e.stderr || "Build failed"
      };
    }
  }

  /**
   * Rebuild after live edit
   */
  async rebuild(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error("Session not found");

    const dockerCmd = [
      "docker run --rm",
      `-v "${session.repoDir}:/repo"`,
      `-v "${session.outputDir}:/output"`,
      DOCKER_IMAGE
    ].join(" ");

    await ensureDockerImage();
    const { stdout, stderr } = await run(dockerCmd);
    return { stdout, stderr };
  }

  /**
   * Serve built files
   */
  async getArtifact(sessionId, filePath) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error("Session not found");

    // Resolve and verify path stays inside the output directory (prevents path traversal)
    const resolved = path.resolve(session.outputDir, filePath);
    const allowed  = path.resolve(session.outputDir);
    if (!resolved.startsWith(allowed + path.sep) && resolved !== allowed) {
      throw new Error("Path traversal attempt blocked");
    }
    return fs.readFileSync(resolved);
  }

  collectArtifacts(baseDir) {
    const out = [];

    function walk(dir) {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, f.name);
        if (f.isDirectory()) walk(full);
        else {
          out.push({
            name: f.name,
            path: path.relative(baseDir, full).replace(/\\/g, "/"),
            ext: path.extname(f.name)
          });
        }
      }
    }

    walk(baseDir);

    return out.sort((a, b) =>
      a.name === "index.html" ? -1 :
      b.name === "index.html" ? 1 :
      a.name.localeCompare(b.name)
    );
  }

  cleanup(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    fs.rmSync(path.dirname(session.repoDir), { recursive: true, force: true });
    this.sessions.delete(sessionId);
  }
}
