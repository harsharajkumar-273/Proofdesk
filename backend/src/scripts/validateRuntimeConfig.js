import path from 'path';
import { fileURLToPath } from 'url';
import {
  formatRuntimeValidation,
  validateRuntimeConfig,
} from '../utils/runtimeConfig.js';
import { loadRuntimeEnv } from '../utils/loadRuntimeEnv.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadRuntimeEnv(__dirname);

const strict = process.argv.includes('--strict');
const validation = validateRuntimeConfig(process.env, { strict });

if (validation.ready) {
  console.log('Runtime configuration is ready.');
} else {
  console.error('Runtime configuration is not ready.');
}

if (validation.errors.length > 0 || validation.warnings.length > 0) {
  console.log(formatRuntimeValidation(validation));
}

process.exit(validation.ready ? 0 : 1);
