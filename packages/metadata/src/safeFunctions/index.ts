/**
 * **Safe functions** — a serializable vocabulary of conditions and values, and
 * the compiler that turns it into executable predicates without `eval`.
 *
 * The vocabulary knows nothing about display sets, hanging protocols or DICOM.
 * It describes tests and values over a subject object, so any feature that
 * currently ships hand-written matching code can be expressed as data instead
 * and shared across the wire.
 *
 * The allowed forms and keys are one table, the schema in `schema.ts`, which
 * the compiler reads. A consumer that wraps conditions and values in a shape of
 * its own extends that table and reuses `compileKey` to walk it.
 *
 * Display-set split rules are the worked example: see
 * `displayset/rawDisplaySetSelector.js`, which wraps these conditions and
 * values in a rule shape of its own (`matches`, `groupBy`, `runBy`, ...), and
 * `displayset/splitRuleSchema.ts`, which describes that rule shape.
 */

export {
  compileCondition,
  compileConditionAt,
  compileExpressionAt,
  compileTemplate,
  compileValue,
  compileValueAt,
  createSite,
  invalid,
  isAbsent,
  looseEquals,
  safeFunctionCompilers,
  toFinite,
  type CompileOptions,
} from './compile';

export {
  at,
  checkForm,
  compileKey,
  conditionShape,
  describeForm,
  describeShape,
  INSTANCE_EXPRESSION_SCOPE,
  invalidAt,
  isLeafKind,
  matchForm,
  readOwn,
  safeFunctionSchema,
  selectForm,
  unrecognized,
  valueShape,
  type ExpressionScope,
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
  compileExpression,
  ExpressionSyntaxError,
  parseExpressionSource,
  tokenize,
  FORBIDDEN_PROPERTIES,
  type CompiledExpression,
  type CompileExpressionOptions,
  type ExpressionNode,
} from './expression';

export type {
  Classifier,
  ClassifierName,
  ClassifierRegistry,
  CompiledPredicate,
  CompiledValue,
  InlinePredicate,
  InlineValue,
  NamedFacts,
  RawCondition,
  RawValue,
  SafeFunctionContext,
  SafeFunctionSubject,
} from './types';
