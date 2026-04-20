import path from 'path';

const DEFAULT_DATA_ROOT = '/tmp/mra-builds';

export const getProofdeskDataRoot = (env = process.env) =>
  path.resolve(env.PROOFDESK_DATA_DIR || DEFAULT_DATA_ROOT);

export const getProofdeskDataPath = (...segments) =>
  path.join(getProofdeskDataRoot(), ...segments);

export const getDefaultProofdeskDataRoot = () => DEFAULT_DATA_ROOT;
