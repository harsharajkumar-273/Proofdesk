import express, { Request, Response } from "express";
import RepositoryCompiler from "../services/repositoryCompiler.js";

const router = express.Router();
const compiler = new RepositoryCompiler();

router.post("/init", async (req: Request, res: Response) => {
  const { owner, repo } = req.body;

  if (!owner || !repo) {
    return res.status(400).json({ error: "Missing repo info" });
  }

  const result = await compiler.build({ owner, repo });
  res.json(result);
});

router.get("/artifact/:sessionId/*", (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const filePath = req.params[0];

  // Files are placed in the "output" subdirectory by repositoryCompiler
  const fullPath = `/tmp/ila-builds/${sessionId}/output/${filePath}`;
  res.sendFile(fullPath, (err: Error) => {
    if (err) {
      // Fallback: try without "output/" in case of older sessions
      const fallbackPath = `/tmp/ila-builds/${sessionId}/${filePath}`;
      res.sendFile(fallbackPath, (fallbackErr: Error) => {
        if (fallbackErr) {
          res.status(404).json({ error: "Artifact not found" });
        }
      });
    }
  });
});

export default router;
