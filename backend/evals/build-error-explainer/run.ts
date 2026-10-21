/**
 * Scores the build error explainer against hand-written failing builds.
 *
 *   ANTHROPIC_API_KEY=... npx tsx evals/build-error-explainer/run.ts [--cases file.json] [model ...]
 *
 * Each model named on the command line (default: the explainer's default)
 * answers every case once. This calls the real API and spends credit, about
 * a cent per model at Haiku prices for the built-in cases.
 *
 * Cases with no expected keywords (as export-cases.ts writes them) are not
 * scored; their answers are printed so you can label them.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { explainBuildError, type BuildErrorExplanation } from '../../src/services/buildErrorExplainer.js';
import type { SourceSnippet } from '../../src/services/buildSourceContext.js';

interface EvalCase {
  id: string;
  log: string;
  sourceContext: SourceSnippet[];
  expect: { locations?: string[]; keywords: string[]; forbidden?: string[] };
}

const here = path.dirname(fileURLToPath(import.meta.url));

/** Splits argv into an optional `--cases` file and the models to try. */
export const parseArgs = (argv: string[]): { casesFile: string; models: string[] } => {
  const models: string[] = [];
  let casesFile = path.join(here, 'cases.json');
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--cases' && argv[i + 1]) casesFile = path.resolve(argv[(i += 1)]);
    else models.push(argv[i]);
  }
  return { casesFile, models };
};

/** Returns the reasons a case failed; empty means it passed. */
export const grade = (explanation: BuildErrorExplanation, expect: EvalCase['expect']): string[] => {
  const failures: string[] = [];
  const prose = [explanation.summary, explanation.likelyCause, ...explanation.fixSteps].join('\n').toLowerCase();

  if (expect.locations && !expect.locations.includes(explanation.location)) {
    failures.push(`location "${explanation.location}" not in ${JSON.stringify(expect.locations)}`);
  }
  if (!expect.keywords.some((k) => prose.includes(k.toLowerCase()))) {
    failures.push(`none of ${JSON.stringify(expect.keywords)} mentioned`);
  }
  const everything = `${prose}\n${explanation.location}`.toLowerCase();
  for (const word of expect.forbidden ?? []) {
    if (everything.includes(word.toLowerCase())) failures.push(`contains forbidden "${word}"`);
  }
  return failures;
};

const main = async () => {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Set ANTHROPIC_API_KEY to run the eval.');
    process.exit(1);
  }
  const { casesFile, models } = parseArgs(process.argv.slice(2));
  if (models.length === 0) models.push(process.env.PROOFDESK_AI_MODEL || '');
  const cases: EvalCase[] = JSON.parse(fs.readFileSync(casesFile, 'utf8'));
  const scored = cases.filter((c) => c.expect.keywords.length > 0).length;

  for (const model of models) {
    let passed = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    console.log(`\n## ${model || 'default model'}`);
    for (const testCase of cases) {
      try {
        const result = await explainBuildError(testCase.log, {
          model: model || undefined,
          sourceContext: testCase.sourceContext,
        });
        inputTokens += result.usage.inputTokens;
        outputTokens += result.usage.outputTokens;
        if (testCase.expect.keywords.length === 0) {
          console.log(`UNLABELLED  ${testCase.id}\n${JSON.stringify(result.explanation, null, 2)}`);
          continue;
        }
        const failures = grade(result.explanation, testCase.expect);
        if (failures.length === 0) passed += 1;
        console.log(`${failures.length === 0 ? 'PASS' : 'FAIL'}  ${testCase.id}${failures.length ? `: ${failures.join('; ')}` : ''}`);
      } catch (error) {
        console.log(`FAIL  ${testCase.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    console.log(`${passed}/${scored} passed, ${inputTokens} input / ${outputTokens} output tokens`);
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
