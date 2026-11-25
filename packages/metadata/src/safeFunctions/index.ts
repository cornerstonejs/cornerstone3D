/**
 * **Safe functions** — a serializable vocabulary of conditions and values, and
 * the compiler that turns it into executable predicates without `eval`.
 *
 * The vocabulary knows nothing about display sets, hanging protocols or DICOM
 * keywords. It describes tests and values over a subject object, so any
 * feature that currently ships hand-written matching code can be expressed as
 * data instead and shared across the wire. The value helpers (`values.ts`) use
 * the DICOM meaning of a missing value: absent is `undefined`, and empty is
 * `null`, `''` or `[]`.
 *
 * The allowed forms and keys are one table, the schema in `schema.ts`, which
 * the compiler reads. A consumer that wraps conditions and values in a shape of
 * its own extends that table, and gives the reader of a name (`readName`).
 *
 * Display-set split rules are the worked example: see
 * `displayset/compileSplitRules.ts`, which wraps these conditions and values
 * in a rule shape of its own (`matches`, `groupBy`, `sortBy`, `attributes`,
 * ...), and `displayset/displaySetContext.ts`, which gives the names.
 */

export {
  compileCondition,
  compileConditionAt,
  compileExpressionAt,
  compileTemplate,
  compileValue,
  compileValueAt,
  createSite,
  hasNoValue,
  invalid,
  isAbsent,
  isEmpty,
  isTrue,
  compareFinite,
  looseEquals,
  parseTemplate,
  readNameAt,
  readOwnName,
  safeFunctionCompilers,
  type CompileOptions,
  type TemplateSegment,
} from './compile';

export {
  compileMatchTest,
  MATCH_HELPERS,
  MATCH_OPERATORS,
  type ValueTest,
} from './matchTests';

export {
  at,
  checkForm,
  compileKey,
  conditionShape,
  deepFreeze,
  describeForm,
  describeShape,
  didYouMean,
  INSTANCE_EXPRESSION_SCOPE,
  invalidAt,
  isLeafKind,
  isUnsafeKey,
  MATCH_OPERATOR_NAMES,
  matchForm,
  matchTestShape,
  hasOwn,
  readOwn,
  RuleCompileError,
  safeFunctionSchema,
  selectForm,
  unrecognized,
  valueShape,
  type ExpressionScope,
  type NameReader,
  type NameReaderFunction,
  type Schema,
  type SchemaForm,
  type SchemaKey,
  type SchemaLeafKind,
  type SchemaShape,
  type SchemaSite,
  type ShapeCompiler,
} from './schema';

export {
  collectIdentifiers,
  collectReads,
  compileExpression,
  ExpressionSyntaxError,
  parseExpressionSource,
  tokenize,
  FORBIDDEN_PROPERTIES,
  type CompiledExpression,
  type CompileExpressionOptions,
  type ExpressionNode,
  type ExpressionRead,
} from './expression';

export type {
  CompiledPredicate,
  CompiledValue,
  InlinePredicate,
  InlineValue,
  RawCondition,
  RawMatchTest,
  RawScalar,
  RawValue,
  SafeFunctionSubject,
} from './types';
