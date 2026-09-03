/**
 * **Safe functions** — a serializable vocabulary of conditions and values, and
 * the compiler that turns it into executable predicates without `eval`.
 *
 * The vocabulary knows nothing about display sets, hanging protocols or DICOM.
 * It describes tests and values over a subject object, so any feature that
 * currently ships hand-written matching code can be expressed as data instead
 * and shared across the wire.
 *
 * Display-set split rules are the worked example: see
 * `displayset/rawDisplaySetSelector.js`, which wraps these conditions and
 * values in a rule shape of its own (`matches`, `groupBy`, `runBy`, ...).
 */

export {
  compileCondition,
  compileTemplate,
  compileValue,
  invalid,
  isAbsent,
  looseEquals,
  toFinite,
} from './compile';

export {
  compileExpression,
  ExpressionSyntaxError,
  parseExpressionSource,
  tokenize,
  FORBIDDEN_PROPERTIES,
  type CompiledExpression,
  type CompileExpressionOptions,
} from './expression';

export type {
  Classifier,
  ClassifierName,
  ClassifierRegistry,
  CompiledPredicate,
  CompiledValue,
  NamedFacts,
  RawCondition,
  RawValue,
  SafeFunctionContext,
  SafeFunctionSubject,
} from './types';
