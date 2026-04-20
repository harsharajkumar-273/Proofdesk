import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const findBackendRoot = (currentDir) => {
  let dir = path.resolve(currentDir);

  for (let depth = 0; depth < 6; depth += 1) {
    if (
      fs.existsSync(path.join(dir, 'package.json'))
      && fs.existsSync(path.join(dir, 'src', 'server.js'))
    ) {
      return dir;
    }

    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return path.resolve(currentDir, '..');
};

export const loadRuntimeEnv = (currentDir) => {
  const mode = String(process.env.NODE_ENV || 'development').trim();
  const lockedEnvKeys = new Set(Object.keys(process.env));
  const backendRoot = findBackendRoot(currentDir);
  const projectRoot = path.resolve(backendRoot, '..');
  
  const candidateFiles = [
    path.resolve(backendRoot, '.env'),
    path.resolve(backendRoot, `.env.${mode}`),
    path.resolve(backendRoot, '.env.local'),
    path.resolve(backendRoot, `.env.${mode}.local`),
    path.resolve(projectRoot, '.env'),
    path.resolve(projectRoot, '.env.local'),
  ];

  candidateFiles.forEach(filePath => {
    if (fs.existsSync(filePath)) {
      const envConfig = dotenv.parse(fs.readFileSync(filePath));
      for (const k in envConfig) {
        if (!lockedEnvKeys.has(k)) {
          process.env[k] = envConfig[k];
        }
      }
    }
  });
};
