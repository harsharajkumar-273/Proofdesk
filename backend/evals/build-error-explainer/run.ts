/**
 * Scores the build error explainer against hand-written failing builds.
 *
 *   ANTHROPIC_API_KEY=... npx tsx evals/build-error-explainer/run.ts [model ...]
 *
 * Each model named on the command line (default: the explainer's default)
 * answers every case once. This calls the real API and spends credit, about
 * a cent per model at Haiku prices.
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
const cases: EvalCase[] = JSON.parse(fs.readFileSync(path.join(here, 'cases.json'), 'utf8'));

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
  const models = process.argv.slice(2);
  if (models.length === 0) models.push(process.env.PROOFDESK_AI_MODEL || '');

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
        const failures = grade(result.explanation, testCase.expect);
        if (failures.length === 0) passed += 1;
        console.log(`${failures.length === 0 ? 'PASS' : 'FAIL'}  ${testCase.id}${failures.length ? `: ${failures.join('; ')}` : ''}`);
      } catch (error) {
        console.log(`FAIL  ${testCase.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    console.log(`${passed}/${cases.length} passed, ${inputTokens} input / ${outputTokens} output tokens`);
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
