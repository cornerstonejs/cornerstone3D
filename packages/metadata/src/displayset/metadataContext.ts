/**
 * The **active metadata context**, and the read of one context name for one
 * instance with no split rules.
 *
 * A host sets the context that it gives to `createDisplaySetSplitRules` also
 * here (OHIF: the `metadataContext` customization), so that `isImageInstance`
 * and the other code tests give the same answer as the rules.
 *
 * @module displayset/metadataContext
 */

import { createSite, safeFunctionCompilers } from '../safeFunctions';
import { ContextProgram, defaultMetadataContext } from './displaySetContext';
import type { DisplaySetContext } from './displaySetContext';
import { BUILT_IN_SERIES_FUNCTIONS } from './seriesFunctions';
import { splitRuleSchema } from './splitRuleSchema';
import type {
  NaturalizedInstance,
  SeriesFunction,
  SeriesFunctionDefinition,
} from './types';

let activeContext: DisplaySetContext = defaultMetadataContext;

/**
 * Sets the active metadata context: the entries over `defaultMetadataContext`
 * that the code tests read when no context is given. `undefined` goes back to
 * the default. A new object gives a new compile at the next read.
 */
export function setMetadataContext(context?: DisplaySetContext): void {
  activeContext = context ?? defaultMetadataContext;
}

/** The active metadata context (see {@link setMetadataContext}). */
export function getMetadataContext(): DisplaySetContext {
  return activeContext;
}

/** The compiled program of each context object, keyed by that object. */
const programs = new WeakMap<object, ContextProgram>();

/** Options of {@link compileMetadataContext}. */
export type CompileMetadataContextOptions = {
  seriesFunctions?: Readonly<
    Record<string, SeriesFunction | SeriesFunctionDefinition>
  >;
  deniedNames?: readonly string[];
  /** What the messages call the context. */
  definition?: string;
};

/**
 * Compiles `context` over `defaultMetadataContext`, and keeps the program in
 * the cache under the `context` object. `createDisplaySetSplitRules` uses it
 * too, so a split rule set and the code tests share one compile.
 */
export function compileMetadataContext(
  context: DisplaySetContext | undefined,
  options: CompileMetadataContextOptions = {}
): ContextProgram {
  const program = new ContextProgram(
    { ...defaultMetadataContext, ...context },
    {
      seriesFunctions: {
        ...BUILT_IN_SERIES_FUNCTIONS,
        ...options.seriesFunctions,
      },
      deniedNames: options.deniedNames,
      site: createSite(
        {
          definition: options.definition ?? 'metadata context',
          path: 'context',
        },
        splitRuleSchema,
        safeFunctionCompilers
      ),
    }
  );
  if (context) {
    programs.set(context, program);
  }
  return program;
}

/** The cached program of `context`, compiled at the first read. */
function programOf(context: DisplaySetContext): ContextProgram {
  return programs.get(context) ?? compileMetadataContext(context);
}

/**
 * Reads the context name `name` for one instance, with no split rules: the
 * value of the entry of `context`, else of the active context. The entry must
 * have the instance scope (`isImage`, `isVideo`, ...); a series-scope entry is
 * an error, because one instance is not a series.
 *
 * @throws when the context has no entry `name`, or the entry has the series
 *   scope.
 */
export function getContextValue(
  name: string,
  instance: NaturalizedInstance,
  context?: DisplaySetContext
): unknown {
  return programOf(context ?? activeContext).instanceValue(name, instance);
}
