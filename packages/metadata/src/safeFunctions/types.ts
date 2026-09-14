/**
 * Types for **safe functions** — the serializable vocabulary that
 * {@link compileCondition} and {@link compileValue} turn into executable
 * predicates and readers.
 *
 * The vocabulary is deliberately not about display sets, or about DICOM. It
 * describes tests and values over *some subject object*: "does this attribute
 * equal that", "bucket this number", "build this string". Display-set split
 * rules are the first consumer (see `displayset/rawDisplaySetSelector.js`);
 * hanging protocols and any other place that today ships hand-written matching
 * code are the intended next ones.
 *
 * Everything here is plain JSON: objects, arrays, strings, numbers, booleans.
 * The behaviour that JSON cannot express — "is this instance a video?" — is
 * referenced **by name** and resolved against a registry the caller supplies.
 * That is what makes the compiled predicates *safe*: they are assembled from a
 * closed vocabulary, so a definition can be loaded from a config file, an HTTP
 * response, or an application's customization layer without ever evaluating
 * supplied code.
 */

/** The object a compiled predicate or reader is evaluated against. */
export type SafeFunctionSubject = Record<string, unknown>;

/** A named classifier, e.g. `'image'`, `'video'`, `'localizer'`. */
export type ClassifierName = string;

/** Classifies a single subject. Registered under a {@link ClassifierName}. */
export type Classifier<Subject = SafeFunctionSubject> = (
  subject: Subject
) => boolean;

/** Named classifiers a definition may reference as `{ classifier: <name> }`. */
export type ClassifierRegistry<Subject = SafeFunctionSubject> = Record<
  ClassifierName,
  Classifier<Subject>
>;

/** Facts a caller derived up front and reads back by name. */
export type NamedFacts = Record<string, boolean>;

/**
 * Evaluation context. Facts live under `series` because the display-set
 * compiler derives them once per series; a consumer with no facts to derive
 * passes an empty context and never writes a `{ seriesFact }` condition.
 */
export type SafeFunctionContext = {
  series?: NamedFacts;
};

/**
 * A condition over one subject (plus, for `seriesFact`, the facts the caller
 * derived). Exactly one form per object.
 */
export type RawCondition =
  /**
   * An expression in the safe function language, e.g.
   * `"Modality === 'CT' && Rows > 512"`. Parsed and compiled — never `eval`ed.
   *
   * A bare string is unambiguous here because no other condition form is a
   * string. In *value* position a bare string already means an attribute name,
   * so there the object form `{ expression }` is required.
   *
   * @see expression/compiler.ts for the grammar.
   */
  | string
  /** The object form, identical in meaning to the bare string. */
  | { expression: string }
  /** True when the named classifier accepts the subject. */
  | { classifier: ClassifierName }
  /** True when the named fact (see {@link SafeFunctionContext}) is truthy. */
  | { seriesFact: string }
  /** True when the attribute is present (not `undefined` / `null` / `''`). */
  | { attribute: string; exists: true }
  /** True when the attribute is absent (`undefined` / `null` / `''`). */
  | { attribute: string; absent: true }
  /** Loose equality against the attribute's value coerced to a string. */
  | { attribute: string; equals: string | number | boolean }
  | { attribute: string; notEquals: string | number | boolean }
  /** Membership test against the attribute's value coerced to a string. */
  | { attribute: string; in: (string | number | boolean)[] }
  | { attribute: string; notIn: (string | number | boolean)[] }
  /**
   * Substring test against the attribute's value coerced to a string. Case
   * sensitive unless `ignoreCase` is set. False when the attribute is absent.
   *
   * Site rules routinely key off free-text descriptions ("does SeriesDescription
   * mention flow?"), which no equality test can express.
   */
  | { attribute: string; contains: string; ignoreCase?: boolean }
  /** True when the attribute's value contains **any** of these substrings. */
  | { attribute: string; containsAny: string[]; ignoreCase?: boolean }
  /** Numeric comparison; false when the attribute is not a finite number. */
  | { attribute: string; greaterThan: number }
  | { attribute: string; lessThan: number }
  /** All / any / negation of nested conditions. `all: []` is true, `any: []` false. */
  | { all: RawCondition[] }
  | { any: RawCondition[] }
  | { not: RawCondition };

/**
 * A value read off a subject. Used wherever a definition needs a *value* rather
 * than a boolean — a grouping key, a run boundary, a derived attribute.
 *
 * A bare string is shorthand for `{ attribute: <string> }`.
 */
export type RawValue =
  | string
  | {
      attribute: string;
      /** Coerce to a number (`undefined` when not finite). */
      number?: true;
      /** Yield `true`/`false` for absent/present instead of the value. */
      absent?: true;
      /** Yield `Math.round(value / bucket)` - a deliberately fuzzy bucket. */
      bucket?: number;
    }
  /** Yield the boolean result of a condition. */
  | { condition: RawCondition }
  /**
   * Yield whatever an expression in the safe function language evaluates to —
   * not coerced to a boolean, so this is how a computed *value* is written:
   * `{ expression: 'Rows * Columns' }`.
   */
  | { expression: string }
  /**
   * Yield a string built by substituting `{AttributeName}` placeholders with the
   * subject's values, e.g. `{ template: 'US series {InstanceNumber}' }`. An
   * absent attribute substitutes to an empty string. Use `\{` for a literal
   * brace.
   *
   * Substitution is the only operation - there is no expression syntax, so a
   * template can never be a route to evaluated code.
   */
  | { template: string }
  /**
   * Yield one string built from several values, e.g.
   * `{ join: '&', parts: [{ label: 'rows', attribute: 'Rows', bucket: 64 }] }`
   * produces `rows=8`. Use when several attributes must form a *single* value.
   */
  | {
      join: string;
      parts: (RawValue & { label?: string })[];
    };

/** A compiled {@link RawCondition}. */
export type CompiledPredicate<Subject = SafeFunctionSubject> = (
  subject: Subject,
  context?: SafeFunctionContext
) => boolean;

/** A compiled {@link RawValue}. */
export type CompiledValue<Subject = SafeFunctionSubject> = (
  subject: Subject,
  context?: SafeFunctionContext
) => unknown;
