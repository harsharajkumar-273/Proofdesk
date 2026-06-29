import path from 'path';

const DEFAULT_DATA_ROOT = '/tmp/mra-builds';

export const getProofdeskDataRoot = (env: NodeJS.ProcessEnv = process.env): string =>
  path.resolve(env.PROOFDESK_DATA_DIR || DEFAULT_DATA_ROOT);

export const getProofdeskDataPath = (...segments: string[]): string =>
  path.join(getProofdeskDataRoot(), ...segments);

export const getDefaultProofdeskDataRoot = (): string => DEFAULT_DATA_ROOT;
