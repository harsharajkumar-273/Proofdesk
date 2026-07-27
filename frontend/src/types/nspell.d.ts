/**
 * Minimal ambient declaration for `nspell`, which ships no types of its own.
 *
 * Declared locally rather than pulling in `@types/nspell`: that package
 * depends on `@types/node`, which would widen the app project's global scope
 * (tsconfig.app.json pins `types` to `vite/client`) and change the inferred
 * return type of `window.setTimeout` from `number` to `NodeJS.Timeout`,
 * breaking the existing timer refs in EditorPage.tsx.
 *
 * Only the surface Proofdesk actually uses is declared.
 */
declare module 'nspell' {
  interface NSpell {
    /** True when the word is spelled correctly. */
    correct(word: string): boolean;
    /** Suggested corrections, closest first. */
    suggest(word: string): string[];
    /** Adds a word to the runtime dictionary. */
    add(word: string, model?: string): NSpell;
    /** Removes a word from the runtime dictionary. */
    remove(word: string): NSpell;
  }

  /**
   * Builds a checker from Hunspell affix and dictionary sources. Both may be
   * supplied as strings or buffers; Proofdesk passes strings fetched at
   * runtime.
   */
  function nspell(aff: string | Uint8Array, dic: string | Uint8Array): NSpell;

  export default nspell;
  export type { NSpell };
}
