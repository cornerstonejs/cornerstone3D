/**
 * Types for **safe functions** — the serializable vocabulary that
 * {@link compileCondition} and {@link compileValue} turn into executable
 * predicates and readers.
 *
 * The vocabulary is deliberately not about display sets, or about DICOM. It
 * describes tests and values over *some subject object*: "does this name equal
 * that", "build this string from these names". Display-set split rules are the
 * first consumer (see `displayset/displaySetRules.js`); hanging protocols
 * and any other place that today ships hand-written matching code are the
 * intended next ones.
 *
 * Everything here is plain JSON: objects, arrays, strings, numbers, booleans -
 * except that an actual function is also accepted in the place of any
 * condition, test or value, and passes through as is. The keys each form
 * allows are in the schema (`schema.ts`), which the compiler reads; an unknown
 * key is a compile error.
 *
 * A consumer decides what a name reads (see `SchemaSite.readName`). The
 * display set consumer reads a DICOM keyword from the instance, and a context
 * name from the display set context, and it rejects every other name.
 */

/** The object a compiled predicate or reader is evaluated against. */
export type SafeFunctionSubject = Record<string, unknown>;

/** A scalar of a test: a string, a finite number or a boolean. */
export type RawScalar = string | number | boolean;

/**
 * The test of one entry of a condition map. See `matchTests.ts` for the
 * meaning of each form and operator.
 */
export type RawMatchTest =
  /** Equal to the scalar, with `==`. */
  | RawScalar
  /** Equal to one element. */
  | RawScalar[]
  /** No value: absent, or `null`, `''`, `[]`. */
  | null
  | { equals: RawScalar | null }
  | { doesNotEqual: RawScalar | null }
  | { notNull: boolean }
  | { includes: RawScalar | RawScalar[] }
  | { doesNotInclude: RawScalar | RawScalar[] }
  | { greaterThan: number }
  | { lessThan: number }
  | { range: [number, number] }
  | { contains: string | string[] }
  | { containsI: string | string[] }
  | { doesNotContain: string | string[] }
  | { doesNotContainI: string | string[] }
  | { containsAll: RawScalar | RawScalar[] }
  | { startsWith: string | string[] }
  | { endsWith: string | string[] }
  /** An actual function, called `(value, subject, context)`. */
  | ((value: unknown, subject?: unknown, context?: unknown) => boolean);

/**
 * A condition over one subject: a map of name to test. Every entry must hold,
 * so `{}` is true. There is no `all`, `any` or `not`: a consumer gives an "or"
 * a name of its own (the display set context does), and `false` on a named
 * boolean is its negation.
 */
export type RawCondition = Record<string, RawMatchTest> | InlinePredicate;

/** A function in the place of a condition, called `(subject, context)`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type InlinePredicate = (subject: any, context?: any) => boolean;

/** A function in the place of a value, called `(subject, context)`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type InlineValue = (subject: any, context?: any) => unknown;

/**
 * A value read off a subject: a grouping key, a run boundary, a display set
 * attribute.
 */
export type RawValue =
  /** A name. */
  | string
  /**
   * A string built by substituting `{name}` placeholders, e.g.
   * `{ template: 'US series {InstanceNumber}' }`. A name with no value
   * substitutes an empty string. Use `\{` for a literal brace. Substitution
   * is the only operation, so a template can never be a route to evaluated
   * code.
   */
  | { template: string }
  /**
   * The result of an expression in the safe function language, not coerced to
   * a boolean: `{ expression: 'Rows * Columns' }`.
   */
  | { expression: string }
  /** An actual function, which passes through as is. */
  | InlineValue;

/** A compiled {@link RawCondition}. */
export type CompiledPredicate<Subject = SafeFunctionSubject> = (
  subject: Subject,
  context?: unknown
) => boolean;

/** A compiled {@link RawValue}. */
export type CompiledValue<Subject = SafeFunctionSubject> = (
  subject: Subject,
  context?: unknown
) => unknown;
