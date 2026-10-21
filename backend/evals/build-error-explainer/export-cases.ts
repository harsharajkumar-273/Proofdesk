/**
 * Exports real failed builds from the BuildLog table as eval cases.
 *
 *   npx tsx evals/build-error-explainer/export-cases.ts [limit]
 *
 * Writes real-cases.local.json next to this file (git-ignored: it holds
 * users' build output and source). Each case is redacted and shortened the
 * same way as a live request, and gets source context when its workspace is
 * still on disk. Failures with the same first error line are kept once.
 *
 * Cases come out unlabelled (`keywords: []`). run.ts prints the model's
 * answer for those so you can fill in `expect` and promote the good ones into
 * cases.json after removing anything private.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import prisma from '../../src/services/db.js';
import { prepareLogForModel } from '../../src/services/buildErrorExplainer.js';
import { collectSourceContext } from '../../src/services/buildSourceContext.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.join(here, 'real-cases.local.json');

/** The first line that looks like an error, used to drop repeats of the same failure. */
export const firstErrorLine = (log: string): string =>
  log
    .split('\n')
    .find((line) => /error|fatal|undefined control sequence|traceback/i.test(line))
    ?.replace(/\d+/g, 'N')
    .trim() ?? '';

const main = async () => {
  const limit = Number.parseInt(process.argv[2] ?? '50', 10) || 50;
  const rows = await prisma.buildLog.findMany({
    where: { status: 'failed' },
    orderBy: { createdAt: 'desc' },
    take: limit * 4,
    include: { session: { select: { repoPath: true } } },
  });

  const seen = new Set<string>();
  const cases = [];
  for (const row of rows) {
    if (cases.length >= limit) break;
    const log = prepareLogForModel([row.stdout, row.stderr].filter(Boolean).join('\n'));
    const signature = firstErrorLine(log);
    if (!log || !signature || seen.has(signature)) continue;
    seen.add(signature);

    const repoPath = row.session?.repoPath;
    const sourceContext = repoPath && fs.existsSync(repoPath) ? await collectSourceContext(repoPath, log) : [];
    cases.push({ id: `real-${row.id.slice(0, 8)}`, log, sourceContext, expect: { keywords: [] } });
  }

  fs.writeFileSync(OUTPUT, `${JSON.stringify(cases, null, 2)}\n`);
  console.log(`Wrote ${cases.length} case(s) to ${path.relative(process.cwd(), OUTPUT)}`);
  await prisma.$disconnect();
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
