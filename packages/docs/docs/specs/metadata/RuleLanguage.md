---
id: rule-language
title: Rule language
summary: One declarative language for conditions, values and sort orders over DICOM metadata, which names each value by a DICOM keyword or by a context name of the display set context, and which display set split rules, hanging protocols and other rule consumers share
---

# Rule language

**Prefix:** `RL`
**Status:** Draft. The user requirements are under review. The implementation
requirements are the recommended approach, and they can change.
**Source:** the review discussion on
[cornerstonejs/cornerstone3D#2861](https://github.com/cornerstonejs/cornerstone3D/pull/2861),
and the revised proposal of 16 October that the reviewer accepted.
**Affects:** `@cornerstonejs/metadata`. Consumers: the display set split rules
in `@cornerstonejs/metadata`, and later the hanging protocols of OHIF.

## Scope

This specification describes one rule language. The rule language has four
parts:

- a **condition**, which tests one subject and gives `true` or `false`,
- a **value**, which reads one value from one subject,
- a **sort order**, which compares two subjects,
- a **context**, which gives a name to each value that a rule reads and that
  does not come directly from a DICOM keyword.

A **consumer** wraps the rule language in the fields of its own rules. The
first consumer is the display set split rule. The second consumer is the
hanging protocol. Each consumer gets the same meaning for the same text.

The specification has two requirement sections:

- **User requirements** (`RL-READ`, `RL-VALUE`, `RL-CTX`, `RL-SHARE`,
  `RL-EXT`, `RL-SCOPE`, `RL-CODE`, `RL-SAFE`, `RL-ERR`) state what a rule
  author, a reviewer, an assistant or a host developer must be able to do or
  to determine.
- **Implementation requirements** (`RL-PKG`, `RL-API`, `RL-NAME`, `RL-COND`,
  `RL-VAL`, `RL-SORT`, `RL-EXPR`, `RL-CTXI`, `RL-FN`, `RL-CONS`, `RL-TEST`)
  state the recommended approach.

Change rule:

- A user requirement changes in two cases only: the requirement describes the
  behaviour wrongly, or the intended user-facing behaviour itself changes. An
  implementation that is inconvenient is never a reason to change a user
  requirement.
- An implementation requirement changes freely when a better approach appears.

Out of scope:

- The engine of the display set split (claims, split keys, priorities). The
  engine stays as it is. This specification changes only the language that
  compiles onto the hooks of the engine.
- The scoring and the layout of a hanging protocol. A hanging protocol uses the
  rule language only to test a study, a display set or an instance.
- The change of the OHIF hanging protocols to the operator meanings of
  `RL-READ-4`. A later OHIF pull request makes that change. That pull request
  converts the old form, or gives a warning for the old form.
- A JSON Schema of the rules. A later pull request adds the schema. The
  declarations record `vr` and `vm` for that schema (`RL-CTX-6`).

### Changes from the draft of 13 October

The review of 14 October changed these user requirements: `RL-READ-3`,
`RL-READ-4`, `RL-READ-5`, `RL-CODE-4`, `RL-SCOPE-1`, `RL-SCOPE-6` and
`RL-SCOPE-8`. The review added the groups `RL-VALUE` and `RL-CTX`.
`RL-SCOPE-9` (the deny list) did not change.

The review of the implementation changed the meaning of three more user
requirements:

- `RL-EXT-3`: a named attribute no longer computes a value over a whole
  display set. An `{ "expression" }` value in `attributes` does.
- `RL-SCOPE-7`: the compile checks a name against the DICOM dictionary and the
  context, and not against an allow list.
- `RL-ERR-3`: a loop through a code entry gives an error at the first read.

Other user requirements changed their words only, because the scopes went
away: `RL-READ-1`, `RL-READ-2`, `RL-SHARE-1`, `RL-SHARE-3`, `RL-SHARE-4`,
`RL-EXT-2`, `RL-SCOPE-2` to `RL-SCOPE-5`, `RL-CODE-5`, `RL-SAFE-2` and
`RL-ERR-2`. `RL-READ-7`, `RL-CODE-6` and `RL-ERR-4` are new.

The implementation groups `RL-REG` (registry) and `RL-ENV` (scopes and
access) of the earlier draft are removed. The context of `RL-CTX` and
`RL-CTXI` replaces them.

The earlier revisions of the pull request had these forms. They are removed,
and no release had them:

- The condition forms `all`, `any`, `not`, `classifier`, `seriesFact`, the
  attribute form `{ attribute, equals }`, and the expression keys and the
  comparison keys of `matches` (`"NumberOfFrames >": 1`).
- The rule `series` list, and the `context.series.*` paths.
- The option `classifiers`. A code entry of the context replaces a classifier.
- The option `customAttributePresets` and the `customAttributes` recipe
  (`set`, `fromFirstInstance`, `fromContext`, `fromOptions`, `preset`).
  `attributes` and the code entries of the context replace them.
- The value forms `{ join, parts }`, `{ attribute, bucket }`,
  `{ attribute, number }`, `{ attribute, absent }` and `{ condition }`.
- The `compareInstances` data forms, also `{ attribute, descending: true }`.
  A descending order is a `{ "sortFunction" }` or a function.
- The aggregates `some`, `every`, `minOf`, `maxOf`, `sumOf` and
  `count(list, expr)` (`RL-EXPR-1`).

## Definitions

**Subject.** The object that a condition or a value tests or reads. For a split
rule, the subject is one naturalized DICOM instance. For a hanging protocol, the
subject is a study, a display set or an instance.

**Tag keyword.** A keyword of the DICOM dictionary of dcmjs, for example
`Modality`. A rule reads the value of a tag keyword from the instance.

**Context.** A map of named entries. Each entry gives one value. The
**global context** (`displaySetContext`) holds the entries for every rule. The
**rule context** (the `context` field of a rule) holds entries for that rule
only.

**Context name.** The name of a context entry. A context name starts with a
lowercase letter.

**Name.** A tag keyword or a context name. Each key of a condition map, each
entry of `groupBy` and `sortBy`, each string of `attributes`, each template
placeholder and each identifier of an expression is a name.

**Path.** A name and one result field of a group: `timeClusters.start`.

**Group.** A context entry that calls one series function, for example
`timeClusters`. A group gives a result with declared fields.

**Alias.** A context entry that gives a top-level name to a path:
`"sweepStart": "timeClusters.start"`.

**Declaration.** A context entry that reads one attribute of the instance that
the dictionary does not hold: `{ "attribute": "00191010" }`.

**Absent.** The value is `undefined`, or the subject has no property of that
name. In DICOM terms, the element is not there (Type 3).

**Empty.** The value is `null`, `""` or `[]`. In DICOM terms, the element is
there with no value (Type 2).

**No value.** The value is absent or empty.

**Instance scope.** A value has one value for each instance.

**Series scope.** A value has one value for the series.

**Named attribute.** A context entry in code. A host supplies it, and a rule
reads it by name like any other context name.

**Named sort function.** A comparator that the host supplies under a name.

**Deny list.** The attribute names that no rule can read. `__proto__`,
`prototype` and `constructor` are on every deny list.

**Consumer.** Code that defines a kind of rule (split rule, hanging protocol),
and compiles the conditions, values and sort orders of that rule with the rule
language.

**Host.** The application that calls a consumer, for example OHIF or a server
that builds a study index.

**Function place.** A place in a rule that becomes a function after the
compile.

## User requirements

### Readable rules (RL-READ)

- **RL-READ-1** The rule author writes a condition as a map. The keys are
  names, and sibling keys must all hold. The author does not need `all`,
  `attribute` or `equals` for the common case.
- **RL-READ-2** The author writes the common tests without an operator: a
  scalar means "equals", an array means "one of", and `null` means "no value".
- **RL-READ-3** A string in a context entry is an expression. A name or a path
  is the simplest expression. A key of a condition map is never an expression.
  A string at every other place of a rule is a name.
- **RL-READ-4** The author uses the operator names of the OHIF hanging protocol
  constraints (`equals`, `includes`, `contains`, `containsI`, `greaterThan`,
  `range`, `notNull`, and the others). Five operators have a meaning that is
  different from `validator.js`: `equals` is the scalar test, `notNull` is the
  exact opposite of `null`, `includes` accepts a scalar operand, and
  `greaterThan` and `lessThan` are strict and read a numeric string as a
  number. The other operators keep the meaning of `validator.js`, except for
  the rule of `RL-VALUE-4`.
- **RL-READ-5** The author writes a test over the instances of a series (for
  example "the series has fewer than 10 instances", "some instances have a
  b-value") as a context entry with a name. The rule reads the name in the same
  way as a tag keyword. The rule does not hold the test inline.
- **RL-READ-6** The reviewer reads a rule and sees every named attribute that
  the rule uses, at the place where the rule uses it.
- **RL-READ-7** `false` on a named boolean is its negation. An "or" is a
  context entry, and the rule reads its name. The rule language has no `all`,
  `any` or `not`.

### Absent and empty values (RL-VALUE)

- **RL-VALUE-1** The rules use the DICOM meaning of no value, and not the
  JavaScript meaning. `undefined` is absent. `null`, `""` and `[]` are empty.
  An array whose elements all have no value (`[""]`, `[null]`) is also empty.
  "No value" is absent or empty.
- **RL-VALUE-2** An expression tests the kind of a value with a literal
  test. `undefined`, `null` and `defined` are the literals. `!=` is the
  opposite of `==`.

  | `X`                               | `X == undefined` | `X == null` | `X == defined` | `X != undefined` |
  | --------------------------------- | ---------------- | ----------- | -------------- | ---------------- |
  | absent (`undefined`, no property) | `true`           | `true`      | `false`        | `false`          |
  | `null`                            | `false`          | `true`      | `false`        | `true`           |
  | `""`                              | `false`          | `true`      | `false`        | `true`           |
  | `[]` (also `[""]` and `[null]`)   | `false`          | `true`      | `false`        | `true`           |
  | `"CT"` (a value)                  | `false`          | `false`     | `true`         | `true`           |
  - `X == undefined` tests "absent". `X != undefined` tests "present" (the
    value can be empty). So an author can make a distinction between DICOM
    Type 2 (present and empty) and DICOM Type 3 (absent).
  - `X == null` tests "no value". `X == defined` tests "has a value": present
    and not empty.
  - In `matches`, `"X": null` is the same test as `X == null`, and
    `{ "notNull": true }` is the same test as `X == defined`.
  - `defined` is a literal for `==` and `!=` only. In every other position,
    and as a context name, `defined` is a compile error.

- **RL-VALUE-3** When `==` compares two values, two values with no value are
  equal only when they are of the same kind. So `Y == Z` is `false` when `Y`
  is `null` and `Z` is absent, and `null == ""` is `false`. Only the literal
  tests of `RL-VALUE-2` treat the kinds as one.
- **RL-VALUE-4** A comparison (`<`, `<=`, `>`, `>=`, `greaterThan`,
  `lessThan`, `range`) gives `false` when the value has no value, or is not a
  finite number. A numeric string is a number, so `"2" > 1` is `true`. A text
  test (`contains`, `containsI`, `containsAll`, `startsWith`, `endsWith`)
  fails on no value, and its `doesNot...` form holds. `doesNotEqual` and
  `doesNotInclude` hold on no value.
- **RL-VALUE-5** `==` is the only equality. `"1" == 1` is `true`. `===` and
  `!==` are compile errors.
- **RL-VALUE-6** An expression can compare text without case: `lower(text)`
  gives the text in lowercase.
- **RL-VALUE-7** Arithmetic (`+`, `-`, `*`, `/`, `%`) reads a numeric string
  as a number, so `"2" + 1` is `3`. When one side has no value or is not a
  finite number, the result has no value. So `null * 512` has no value, and a
  test such as `{ "lessThan": 100 }` on it fails.
- **RL-VALUE-8** `!`, `&&`, `||` and `?:` read no value as `false`. `&&` and
  `||` give `true` or `false`. So `"isTall": "Rows && Rows > 1000"` is `false`
  when `Rows` is absent, and `"isTall": false` holds.

### The context (RL-CTX)

- **RL-CTX-1** A site defines a new value in the customization data, with no
  TypeScript build. The value is an entry of the global context.
- **RL-CTX-2** One computation can give several names. Each name has one
  definition for all rules: an alias of a field of a group.
- **RL-CTX-3** An entry has one of five forms: a fixed value (a number, a
  boolean, `null` or an array); a string, which is an expression; a
  declaration `{ "attribute", "vr"?, "vm"? }`; a template `{ "template" }`;
  or a group `{ "function", "args"? }`.
- **RL-CTX-4** A rule context replaces a global entry with the same name, for
  that rule only. The replacement also applies inside the global entries that
  the rule reads. So one rule text works with a different argument, or with a
  different group, and every alias follows. A rule context can also define a
  new name that only that rule reads.
- **RL-CTX-5** An entry of a rule context that reads its own name gets the
  global value: `"timeClustersMaxGap": "timeClustersMaxGap * 2"`.
- **RL-CTX-6** A declaration gives access to an attribute that the dictionary
  does not hold: a private tag, a vendor attribute, or a synthetic attribute
  such as `imageId`. A declaration can record `vr` and `vm`.
- **RL-CTX-7** No entry declares a scope. The author can know the scope from
  the entry:
  - A fixed value and a group have one value for the series.
  - A declaration and a code entry have one value for each instance.
  - An expression or a template that reads an instance value outside of
    `series.instances.min(...)`, `.max(...)`, `.sum(...)` or `.count(...)`
    has one value for each instance.
  - Every other entry has one value for the series.
- **RL-CTX-8** A site changes one entry by its name (`"dxCrMaxImages":
{ "$set": 20 }`). The site does not copy the expression text of a rule into
  a `$merge`.
- **RL-CTX-9** A value of the series is the same for each display set of the
  series, also in `attributes`.

### One language for each consumer (RL-SHARE)

- **RL-SHARE-1** The same condition text, on the same subject and the same
  context, gives the same result in a split rule and in a hanging protocol.
- **RL-SHARE-2** The host registers a named attribute once, and both a split
  rule and a hanging protocol can use the named attribute.
- **RL-SHARE-3** A new consumer (for example a rule for a worklist filter)
  uses the rule language without a change to the rule language, and without an
  import of the display set code.
- **RL-SHARE-4** The documentation describes the rule language once. The
  documentation of a consumer describes only the fields of its rules.

### Extension by the caller (RL-EXT)

- **RL-EXT-1** The host supplies named attributes and named sort functions to
  the compile, and a rule uses each one by name.
- **RL-EXT-2** A rule uses a named attribute at every place that accepts a
  name: a condition key, a grouping entry, a sort entry, a display set
  attribute, a template and an expression.
- **RL-EXT-3** A named attribute can read the subject and the other names of the context. A group can compute a value over a whole series. A value over the instances of a display set is an `{ "expression" }` value in `attributes`.
- **RL-EXT-4** The author cannot see a difference between a named attribute of
  the host and a built-in named attribute. The syntax is the same.
- **RL-EXT-5** Each consumer supplies its own subjects. A host that shares one
  named attribute between two consumers knows which subject the function gets
  from each consumer.

### Names (RL-SCOPE)

- **RL-SCOPE-1** The reader of a rule sees from the first letter of a name
  where the value comes from. A name with an uppercase first letter is a tag
  keyword, and reads the instance. A name with a lowercase first letter is a
  context name. The one exception is the lowercase DICOM keyword `dBdt`, which
  is a tag keyword. A context name cannot be a tag keyword, so a context never
  hides a value of the instance.
- **RL-SCOPE-2** The consumer, and not the rule language, names the built-in
  values of its rules. The host can add context entries.
- **RL-SCOPE-3** The host supplies values when it starts a split or a match,
  for example `rightOnLeft: false` from a user preference. A change of such a
  value needs no change to the rules.
- **RL-SCOPE-4** A rule tests a host value in a condition. So one rule set
  holds branches: one set of rules for `rightOnLeft` not equal to `false`, and
  another set for `rightOnLeft` equal to `false`.
- **RL-SCOPE-5** A deployment defines computed values from other values, as
  data or as a function. The compile computes a series value one time for each
  series, and not one time for each subject.
- **RL-SCOPE-6** A rule reads a value of the display set (`splitNumber`,
  `sopClassUids`) only in `attributes`. A read of such a value at another
  place is a compile error that names the place.
- **RL-SCOPE-7** A name in a rule is a DICOM keyword, a context name or a declared attribute, with the same case. Any other name is a compile error that names the rule, the place and the name. So a misspelt name (`BodyPartExamind`, `sweepStrat`) fails at compile time. A field that a group does not declare is a compile error. A context name that is a DICOM keyword is a compile error.
- **RL-SCOPE-8** A rule reads an attribute that the dictionary does not hold
  only through a declaration (`RL-CTX-6`). A rule cannot read a hex tag
  directly. There is no optional access with `?`.
- **RL-SCOPE-9** No access reads a name on the deny list, strict or optional.
  The deny list lets a host keep a value (for example a patient identifier) out
  of every rule.
- **RL-SCOPE-10** Names are case sensitive, as DICOM keywords are. A name in a
  rule is valid only when it matches a keyword of the DICOM dictionary of
  dcmjs, or a declared context name, with the same case. Any other name is a
  compile error. When a known name differs only in case, the error names the
  known name: `unknown name 'modality'; did you mean 'Modality'?`. Operators
  are also case sensitive (`notnull` gives `did you mean 'notNull'?`). A
  declared context name is valid also when a keyword differs from it only in
  case (`imageId` and the keyword `ImageID`). A value comparison is case
  sensitive: `"CT"` does not match `"ct"`. `containsI`, `doesNotContainI` and
  `lower()` compare text without case.

### Code for the complex cases (RL-CODE)

- **RL-CODE-1** An extension can put an actual function at every function
  place of a rule, in place of the data for that place.
- **RL-CODE-2** An extension can mix a function at one place with data at the
  other places of the same rule.
- **RL-CODE-3** An extension can write a whole rule as code, with the hooks of
  the consumer, and put that rule in the same rule set as data rules.
- **RL-CODE-4** The compile permits an expression in two places only: a
  context entry, and the `{ "expression": "..." }` form of `attributes`. The
  second place is for a value over the instances of a display set.
- **RL-CODE-5** An expression can read a named attribute by its name.
- **RL-CODE-6** A split that needs complex logic is a new series function in
  code. The context then gives names to its result fields.

### Safe data (RL-SAFE)

- **RL-SAFE-1** A rule that the host reads from JSON (a configuration file, an
  HTTP response, a URL customization) cannot run code that the host did not
  supply.
- **RL-SAFE-2** A misspelt key or name does not change the meaning of a rule
  without a trace. An unknown key or name is an error.

### Errors that name themselves (RL-ERR)

- **RL-ERR-1** A rule that does not compile gives an error that names the
  consumer, the rule, the path in the rule, and the accepted forms at that
  path.
- **RL-ERR-2** An unknown name gives an error that names the name, and says
  how to declare an attribute that the dictionary does not hold.
- **RL-ERR-3** The compile finds every error of the rule data before the consumer uses the rule. A loop of data entries is a compile error. A loop that goes through a code entry gives an error at the first read, and the error names each entry of the loop. The other check at run time is the deny list check (`RL-SCOPE-9`).
- **RL-ERR-4** A string in `attributes` that is not a name (`"SCOUT"`) is a
  compile error. The error names the template form of fixed text.

## Implementation requirements

### Package layout (RL-PKG)

- **RL-PKG-1** The rule language is in `@cornerstonejs/metadata`, in
  `packages/metadata/src/safeFunctions/`. A later release can rename the
  module to `rules/`.
- **RL-PKG-2** No file in `safeFunctions/` imports from `displayset/`, or from
  any other consumer, and no file in `safeFunctions/` knows the DICOM
  dictionary. The consumer gives the reader of each name (`readName`).
- **RL-PKG-3** The split rule consumer is in `packages/metadata/src/displayset/`:
  - `displaySetContext.ts`: the context, the default context, the name check,
    the binding of the entries, and the cache.
  - `compileSplitRules.ts`: the rule fields, and their mapping onto the
    `SplitRule` hooks.
  - `splitRuleSchema.ts`: the table of the rule fields and forms.
  - `rawDisplaySetSelector.js`: the default rules, as JSON data.
- **RL-PKG-4** The hanging protocol consumer is in OHIF
  (`HangingProtocolService`), or in a later CS3D package. Either location uses
  only the public API of `RL-API`.

Layout:

```text
packages/metadata/src/
  safeFunctions/              generic, knows no consumer and no dictionary
    values.ts                 isAbsent, isEmpty, hasNoValue, toFinite, looseEquals
    matchTests.ts             the tests and the operators of a condition map
    compile.ts                compileCondition, compileValue, templates
    schema.ts                 the table machinery and the generic shapes
    expression/               tokenizer, parser, compiler
  displayset/                 consumer 1
    displaySetContext.ts      context, default context, binding, cache
    compileSplitRules.ts      rule fields -> SplitRule hooks
    splitRuleSchema.ts
    rawDisplaySetSelector.js  default rules as data
    ...engine files, unchanged
```

### Public API (RL-API)

- **RL-API-1** `@cornerstonejs/metadata` exports these names of the rule
  language and of the split consumer:

  ```ts
  // generic
  compileCondition(condition, options?: CompileOptions): CompiledPredicate;
  compileValue(value, options?: CompileOptions): CompiledValue;
  compileTemplate(template, site?): CompiledValue;
  compileExpression(source, options?: CompileExpressionOptions): CompiledExpression;
  collectIdentifiers(node): string[];
  collectReads(node, { aggregates? }): ExpressionRead[];
  class RuleCompileError extends Error {
    readonly definition: string; // e.g. 'raw display set selector'
    readonly path: string;       // e.g. "rule 'r'.matches.Modality"
  }

  // split consumer
  createDisplaySetSplitRules(selector?, options?: CreateDisplaySetSplitRulesOptions): SplitRuleSet;
  compileDisplaySetSplitRules(selector, options?): SplitRuleSet;
  defaultDisplaySetContext: DisplaySetContext;
  rawDisplaySetSelector: RawDisplaySetSelector;
  ```

- **RL-API-2** `CompileOptions` holds the path and the name of the definition
  for the messages, the expression scope of the place, and `readName`: the
  function that gives the reader of a name, or throws a compile error for an
  unknown name. The default `readName` reads an own property of the subject.
- **RL-API-3** `CreateDisplaySetSplitRulesOptions` holds:

  ```ts
  type CreateDisplaySetSplitRulesOptions = {
    /** Global context entries, over the entries of defaultDisplaySetContext. */
    displaySetContext?: Record<string, ContextEntry>;
    /** Series functions, over planeGeometry and timeClusters. */
    seriesFunctions?: Record<string, SeriesFunction | SeriesFunctionDefinition>;
    /** Names that no rule can read (RL-SCOPE-9, RL-NAME-7). */
    deniedNames?: readonly string[];
    /** Comparators for a sortBy entry { sortFunction: name }. */
    sortFunctions?: Record<string, Comparator>;
  };
  ```

  OHIF reads `displaySetContext` from the `useMetadataDisplaySet`
  customization, next to `splitRules`.

### Names (RL-NAME)

- **RL-NAME-1** The compile resolves each name in this order: a tag keyword
  (`resolveHexFromKeyword` of `packages/metadata/src/utilities/Tags.ts` gives a
  hex tag), then an entry of the rule context, then an entry of the global
  context, then (in `attributes` only) `splitNumber` and `sopClassUids`.
  Every other name is a compile error.
- **RL-NAME-2** `resolveHexFromKeyword` reads own keys of the dictionary only,
  so `constructor` and `toString` are not keywords.
- **RL-NAME-3** A context name matches `/^[a-z][A-Za-z0-9_]*$/`, is not a tag
  keyword, is not on the deny list, and is not `splitNumber` or
  `sopClassUids`. The compile throws for another name.
- **RL-NAME-4** The expression compiler stays generic, and does not check
  names. The consumer gets the names of an expression with `collectReads`, and
  checks each one. This reverses the choice of the earlier doc comment of
  `compileExpression`, because the declarations handle the private tags, the
  vendor attributes and the synthetic attributes.
- **RL-NAME-5** The error message of an unknown name says how to declare the
  attribute. For a hex tag, the message names the declaration form. In
  `attributes`, the message also names `{ "template": "..." }`.
- **RL-NAME-6** A keyword or a declaration has no field: `{Modality.foo}` and
  `Modality.foo` are compile errors. An item of a sequence is read with an
  index (`ViewCodeSequence[0].CodeValue`). An index on a group
  (`timeClusters['start']`) is a compile error; a rule reads a group field by
  path.
- **RL-NAME-7** The deny list (`RL-SCOPE-9`) is the option `deniedNames` of
  `createDisplaySetSplitRules`. A rule or a context entry that names a denied
  name is a compile error. The `values` of a code entry give `undefined` for a
  denied name, and the logger gives a warning. A code entry also gets the
  instance itself, so the host must not register a code entry that reads a
  denied attribute from the instance.

### Conditions (RL-COND)

- **RL-COND-1** A condition is a map of name to test, or a function. Every
  entry must hold, so `{}` is `true`.
- **RL-COND-2** The test of one map entry is one of:

  | Test                     | The entry holds when                                     |
  | ------------------------ | -------------------------------------------------------- |
  | scalar                   | the value is equal to the scalar, with `==` (`RL-VAL-3`) |
  | array of scalars         | the value is equal to one element of the array           |
  | `null`                   | the value has no value                                   |
  | object with one operator | the operator holds (`RL-COND-3`)                         |
  | function                 | `test(value, subject, context)` is true                  |

- **RL-COND-3** The operators:

  | Operator                            | Operand                       | The entry holds when                                                          |
  | ----------------------------------- | ----------------------------- | ----------------------------------------------------------------------------- |
  | `equals`                            | scalar or `null`              | the scalar test                                                               |
  | `doesNotEqual`                      | scalar or `null`              | `equals` does not hold; no value passes                                       |
  | `notNull`                           | boolean                       | `true`: the value has a value; `false`: the value has no value                |
  | `includes`                          | scalar or array of scalars    | the value has the element, or one of the elements; a single value is an array |
  | `doesNotInclude`                    | scalar or array of scalars    | `includes` does not hold                                                      |
  | `greaterThan`, `lessThan`           | finite number                 | the value is a finite number, and `>` or `<` the operand                      |
  | `range`                             | two finite numbers, any order | the value is a finite number in `[min, max]`                                  |
  | `contains`, `containsI`             | string or array of strings    | one element of the value holds one of the strings (`I`: without case)         |
  | `doesNotContain`, `doesNotContainI` | string or array of strings    | the `contains` form does not hold                                             |
  | `containsAll`                       | scalar or array of scalars    | the value has every element                                                   |
  | `startsWith`, `endsWith`            | string or array of strings    | one element of the value starts or ends with one of the strings               |

- **RL-COND-4** The compile rejects an operand of the wrong kind, a second
  operator, an unknown operator and an empty array test.

### Values (RL-VAL)

- **RL-VAL-1** The value helpers are in `safeFunctions/values.ts`:
  `isAbsent`, `isEmpty`, `hasNoValue`, `toFinite` and `looseEquals`.
  `toFinite` gives `undefined` for no value and for a value that is not a
  finite number, and reads the first value of a multi-valued attribute.
- **RL-VAL-2** A template placeholder is a name or a path. A placeholder with
  no value gives `""`. `\{` and `\}` escape a brace.
- **RL-VAL-3** `looseEquals` (the `==` of expressions, and the scalar test):
  two values with no value are equal only when they are of the same kind
  (absent, `null`, `""`, or an empty array); a value with no value is not
  equal to a value with one; a multi-valued attribute compares on its first
  value; a number and a numeric string compare by value; other scalars compare
  as text. The expression compiler gives `X == undefined`, `X == null` and
  `X == defined` (a literal operand) the tests of `RL-VALUE-2`. The parser
  reads `defined` as a literal, and the compiler rejects it in every other
  position.

### Sort orders (RL-SORT)

- **RL-SORT-1** A sort order is a list of entries. The next entry decides when
  an entry gives `0` or `NaN`.
- **RL-SORT-2** An entry is one of these forms:

  | Form                      | Order                                                                                                                                                          |
  | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `"Name"` or `"name"`      | ascending by the value of the name: numeric when both values are finite numbers, else by text; an instance with no value goes after the instances with a value |
  | `{ "sortFunction": "x" }` | the named sort function `x` of `options.sortFunctions`; an unknown name is a compile error                                                                     |
  | a function                | passes through (`RL-FN-1`)                                                                                                                                     |

### Expressions (RL-EXPR)

- **RL-EXPR-1** The grammar of the expression language stays as it is, with
  these changes: `===` and `!==` are compile errors; `<`, `<=`, `>`, `>=` and
  the arithmetic operators use `toFinite` (`RL-VALUE-7`); `!`, `&&`, `||` and
  `?:` read no value as `false` (`RL-VALUE-8`); the new helpers `lower` and
  `contains`; and the aggregates of `RL-EXPR-2`. The helpers `includes`,
  `contains`, `startsWith` and `endsWith`, and the operator `in`, use the code
  of the operators of the same names, so they give the same results. The
  aggregates `some`, `every`, `minOf`, `maxOf`, `sumOf` and
  `count(list, expr)` do not exist any more.
- **RL-EXPR-2** An aggregate names its receiver:
  - `series.instances.min(x)`, `.max(x)`, `.sum(x)`, `.count(x)` and
    `.count()` run over the instances of the series. A context entry and the
    `{ "expression" }` form of `attributes` can use them.
  - `displaySet.instances.min(x)` (and `max`, `sum`, `count`) run over the
    instances of this display set. Only the `{ "expression" }` form of
    `attributes` can use them. At another place, the compile gives an error
    that names the place.
  - `displaySets` is reserved for a later change. Each use is a compile error
    that refers to
    [issue 3000](https://github.com/cornerstonejs/cornerstone3D/issues/3000).
  - A bare `min(x)`, `max(x)`, `sum(x)`, `count(x)` or `count()` is a compile
    error, and the error gives the receiver forms that the place accepts.
    `min(a, b, ...)` and `max(a, b, ...)` with two or more arguments compare
    their arguments.
  - `series`, `displaySet` and `displaySets` cannot be context names.
  - The parser accepts a method call only in the form
    `<receiver>.instances.<aggregate>(...)`, with these receivers and these
    four aggregates.

  The compiler evaluates the argument one time for each instance. An instance
  whose argument has no value does not count; `count(x)` also skips `false`.
  `sum` of no instance is `0`. `min` and `max` of no instance are `undefined`.
  `count()` is the number of instances. The result does not change with the
  order of the instances.

- **RL-EXPR-3** The number helpers (`abs`, `round`, `floor`, `ceil`,
  `Number`, and `min` and `max` with two or more arguments) give `undefined`
  for a value that is not a finite number, and never `NaN`.
- **RL-EXPR-4** `collectReads` gives each read of an identifier, with the field
  of a direct member access (`timeClusters.start`), an index access
  (`indexed`), and whether the read is in the argument of an aggregate.
- **RL-EXPR-5** An aggregate in an entry with the instance scope
  (`"NumberOfFrames == series.instances.max(NumberOfFrames)"`) runs over the
  series one time for
  each instance: the cost grows with the square of the number of instances. Put
  the aggregate in its own series entry, and read that name.
- **RL-EXPR-6** A compiled expression gives one warning and `undefined` for an
  error at run time, except for a `RuleCompileError`, which goes to the
  caller.

### The context (RL-CTXI)

- **RL-CTXI-1** The global context is `defaultDisplaySetContext` with the
  entries of `options.displaySetContext` over it. An entry of the options
  replaces the default entry with the same name.
- **RL-CTXI-2** The default context:

  ```jsonc
  {
    "timeClustersMaxGap": 30,
    "timeClusters": {
      "function": "timeClusters",
      "args": { "maxGap": "timeClustersMaxGap" },
    },
    "longTimeClusters": {
      "function": "timeClusters",
      "args": { "maxGap": 60 },
    },
    "sweepCount": "timeClusters.clusters",
    "sweepStart": "timeClusters.start",
    "acquisitionSeconds": "timeClusters.time",
    "sweepOffset": "round(sweepStart - timeClusters.first)",

    "planeGeometryTolerance": 0.1,
    "planeGeometry": {
      "function": "planeGeometry",
      "args": { "tolerance": "planeGeometryTolerance" },
    },
    "sliceSpacing": "planeGeometry.spacing",
    "sliceIndex": "planeGeometry.index",
    "sliceDistance": "planeGeometry.distance",

    "seriesInstanceCount": "series.instances.count()",
    "isMultiFrame": "NumberOfFrames > 1",

    "imageId": { "attribute": "imageId" },
  }
  ```

  The default context also holds the code entries `isImage`, `isVideo`,
  `isEcg`, `isWsi` and `isStackImage` (an image that is not a video, a
  waveform or a whole slide). The default context declares each synthetic
  attribute that the default rules and the series functions read; today that
  attribute is `imageId`.

- **RL-CTXI-3** Each series function declares its result fields, and the scope
  of each field. An `instance` field is a map keyed by `instanceKey` (the
  `SOPInstanceUID`, else the `imageId`), and a read of the path gives the value
  of the instance at hand. The built-in fields:

  | Function        | Series fields                                                                                          | Instance fields     |
  | --------------- | ------------------------------------------------------------------------------------------------------ | ------------------- |
  | `timeClusters`  | `first`, `clusters`, `untimedCount`                                                                    | `time`, `start`     |
  | `planeGeometry` | `normal`, `origin`, `spacing`, `regularCount`, `irregularCount`, `positions`, `complete`, `duplicates` | `distance`, `index` |

  A series function in code with no declared fields has fields that the
  compile does not check, with the series scope.

- **RL-CTXI-4** The compile infers the scope of each entry:
  - A fixed value and a group have the series scope.
  - A declaration and a code entry have the instance scope.
  - An expression or a template that reads, outside of a
    `series.instances.*(...)` aggregate, a tag keyword, an instance value or an
    instance field has the instance scope.
  - Every other entry has the series scope.
  - Each argument of a group must have the series scope. An argument with the
    instance scope is a compile error.
- **RL-CTXI-5** An expression that is one name of a group is an alias of the
  group: it gives the same result and the same fields
  (`"timeClusters": "longTimeClusters"`). A path whose first name is not a
  group is a compile error, so `"timeClusters": 5` fails when an alias reads
  `timeClusters.start`.
- **RL-CTXI-6** The compile binds the entries for each rule: it resolves each
  name, infers the scope, finds the cache key, and builds the computation. The
  compile binds every global entry, and every entry of each rule context, also
  an entry that no rule reads. A loop of entries is a compile error that gives
  the loop (`first -> second -> first`).
- **RL-CTXI-7** The cache key of an entry is its name and the replaced names
  (with their data) that the entry reads, directly or through other entries.
  Rules that replace nothing that an entry reads share one computation of that
  entry for each series. A code entry can read any name, so every replacement
  of its rule is in its key.
- **RL-CTXI-8** Each compiled rule has a `series` hook. The first hook of a
  split adds the fact `displaySetContext`: the instances of the series and a
  cache for each compiled rule set. The runtime computes a series value at the
  first read, one time for each split. When the series gets new instances, the
  next split computes the value again. `orderInstancesForRule` with
  `options.series` also computes the values again, over the instances of the
  split and the new instances.
- **RL-CTXI-10** A hook that a host calls directly, with no split context,
  computes the values over the instances of the call only: one instance for
  `matches`, the pair for a comparator, the group for `customAttributes`. So
  `seriesInstanceCount` is `1` in a direct call of `matches`. The logger
  records the first such call at the debug level.
- **RL-CTXI-11** The runtime records the entries that are in progress. A read
  of an entry that is in progress, for the same instance and at the same level
  (the global entry, or the replacement of a rule), is a loop. The runtime then
  throws a `RuleCompileError` that names each entry of the loop, in order:
  `first -> second -> third -> first`. A read of its own name by a rule entry
  resolves to the global level, so it is not a loop. Each call of a code entry
  gets a new `values` wrapper.
- **RL-CTXI-9** The logger `cs3d.metadata.displayset.displaySetContext` records
  each replacement and each new name of a rule context at the debug level.

### Functions (RL-FN)

- **RL-FN-1** At every function place, an actual function passes through the
  compile as it is. A function place is: a whole condition, a test of a map
  entry, a `groupBy` entry, `runBy`, a `sortBy` entry, a whole `attributes`
  (the `customAttributes` hook), and one attribute value.
- **RL-FN-2** JSON cannot hold a function. So a rule from JSON can run only the
  code entries of the context and the functions of the rule language
  (`RL-SAFE-1`). Only host code puts a function into a rule or a context.
- **RL-FN-3** A context entry in code is a function `(instance, values)`, with
  the instance scope. `values` reads every name. A series entry in code is a
  group `{ "function": fn }`. The runtime calls `fn(instances, { args })`: the
  instances of the series and the evaluated `args`, and nothing else. A series
  code entry reads another context value only through an argument expression.
  The `function` of a group can also be a definition `{ compute, fields }`.
- **RL-FN-4** An attribute value in code is a function `(instances, values)`.
  `instances` are the instances of the display set, in their sorted order.
- **RL-FN-5** One compile path handles the JSON form and the code form.

### Consumers (RL-CONS)

- **RL-CONS-1** The fields of a split rule:

  | Field                                           | Holds                                          | `SplitRule` hook   |
  | ----------------------------------------------- | ---------------------------------------------- | ------------------ |
  | `priority`                                      | a finite number, or `null` to exclude the rule | (rule set entry)   |
  | `id`, `groupId`, `description`, `viewportTypes` | data                                           | the same names     |
  | `context`                                       | the rule context (`RL-CTX-3`)                  | (compile only)     |
  | `matches`                                       | a condition                                    | `matches`          |
  | `groupBy`                                       | names                                          | `groupBy`          |
  | `runBy`                                         | a name                                         | `runBy`            |
  | `sortBy`                                        | sort entries (`RL-SORT-2`)                     | `compareInstances` |
  | `attributes`                                    | a map of attribute values (`RL-CONS-2`)        | `customAttributes` |

  Every compiled rule also has the `series` hook of `RL-CTXI-8`.

- **RL-CONS-2** An attribute value is one of:
  - a name. A tag keyword reads the first instance of the sorted display set.
    An instance value of the context reads the same instance. A series value
    is the value of the whole series.
  - a fixed number, boolean or `null`.
  - `{ "template": "..." }`. `{ "template": "SCOUT" }` is fixed text.
  - `{ "expression": "..." }`. `displaySet.instances.*(...)` runs over the
    instances of the display set, `series.instances.*(...)` over the instances
    of the series, and a tag keyword reads the first instance of the display
    set.
  - in code, a function (`RL-FN-4`).
- **RL-CONS-3** `createDisplaySetFromGroup` passes `group.series` to the
  `customAttributes` hook, so an attribute reads the values of the whole series
  (`RL-CTX-9`).
- **RL-CONS-4** The hanging protocol consumer gives its own subject and its
  own reader of a name. A later OHIF pull request moves the hanging protocol
  constraints to the operator meanings of `RL-COND-3`.

### Tests (RL-TEST)

- **RL-TEST-1** A test covers the table of absent and empty values: `null`,
  `notNull`, `== null`, `== undefined`, the comparisons and the text tests on
  `undefined`, `null`, `""`, `[]` and `0`.
- **RL-TEST-2** A test covers each operator meaning that changed from
  `validator.js`.
- **RL-TEST-3** A test covers the name check at each place: a misspelt keyword,
  a misspelt context name, a hex tag, a context name that is a keyword, and
  `"SCOUT"` in `attributes`.
- **RL-TEST-4** A test covers a rule context: a replaced argument, a replaced
  group, a rule entry that reads its own name, and one computation for the
  rules that replace nothing. A test covers a loop of entries.
- **RL-TEST-5** The tests of the default rules stay the guard of their
  behaviour.
- **RL-TEST-6** The error tests check the rule id, the path and the name. Only a
  small number of tests check the full message text.

## Examples

### Example 1: `usTimeClusters`

```jsonc
"usTimeClusters": {
  "priority": -1,
  "viewportTypes": ["stack"],
  "context": { "timeClustersMaxGap": 20 },
  "matches": {
    "isStackImage": true,
    "Modality": "US",
    "isMultiFrame": false,
    "sweepCount": { "greaterThan": 1 },
    "sweepStart": { "notNull": true }
  },
  "groupBy": ["SeriesInstanceUID", "sweepStart"],
  "sortBy": ["acquisitionSeconds"],
  "attributes": { "SeriesDescription": { "template": "{SeriesDescription} +{sweepOffset} s" } }
}
```

- `sweepCount` is a series value. The rule reads it directly.
- `{ "greaterThan": 1 }` is a strict `>`. So a series with one sweep does not
  match.
- The gap of 20 seconds applies to this rule only. Other rules keep the default
  gap of 30 seconds. `sweepStart`, `sweepCount` and `sweepOffset` all read the
  replaced gap (`RL-CTX-4`).
- `"isMultiFrame": false` holds when `NumberOfFrames` is absent, because
  `NumberOfFrames > 1` gives `false` (`RL-VALUE-4`).

### Example 2: a different group, and the same rule text

```jsonc
"usLongSweeps": {
  "priority": -1,
  "viewportTypes": ["stack"],
  "context": { "timeClusters": "longTimeClusters" },
  "matches": { "isStackImage": true, "Modality": "US", "sweepCount": { "greaterThan": 1 } },
  "groupBy": ["SeriesInstanceUID", "sweepStart"],
  "sortBy": ["acquisitionSeconds"]
}
```

- `sweepStart`, `sweepCount`, `acquisitionSeconds` and `sweepOffset` all read
  `longTimeClusters` for this rule.
- The engine computes `longTimeClusters` one time for each series. Each rule
  that reads `longTimeClusters` uses that one result (`RL-CTXI-7`).

### Example 3: `regularVolume`

The module adds one series value to the global context. Both of its rules read
the value:

```jsonc
"displaySetContext": {
  "mixesIrregular": "planeGeometry.regularCount >= 3 && planeGeometry.irregularCount > 0 && planeGeometry.complete"
},
"splitRules": {
  "$merge": {
    "regularVolume": {
      "priority": -2,
      "viewportTypes": ["volume", "volume3d", "stack"],
      "matches": {
        "isStackImage": true,
        "Modality": ["CT", "MR", "PT", "NM"],
        "mixesIrregular": true,
        "sliceIndex": { "notNull": true }
      },
      "groupBy": ["SeriesInstanceUID"],
      "sortBy": ["sliceDistance"],
      "attributes": { "SeriesDescription": { "template": "{SeriesDescription} ({sliceSpacing} mm)" } }
    },
    "irregularImages": {
      "priority": null,
      "viewportTypes": ["stack"],
      "matches": {
        "isStackImage": true,
        "Modality": ["CT", "MR", "PT", "NM"],
        "mixesIrregular": true,
        "sliceIndex": null
      },
      "groupBy": ["SeriesInstanceUID"],
      "attributes": { "SeriesDescription": { "template": "{SeriesDescription} (other images)" } }
    }
  }
}
```

- `regularCount`, `irregularCount` and `complete` have no alias. The module
  reads them by path.
- `"sliceIndex": null` means "no value". Index 0 is a valid index, and
  `notNull` is true for 0.
- `{sliceSpacing}` is a series value, so each display set of the series shows
  the same spacing (`RL-CTX-9`).

### Example 4: `volumeProjectionOrder`

```jsonc
"volume3d": {
  "priority": 4,
  "viewportTypes": ["volume", "volume3d", "stack"],
  "matches": {
    "isStackImage": true,
    "Modality": ["CT", "MR", "PT", "NM"],
    "seriesInstanceCount": { "greaterThan": 1 },
    "Rows": { "notNull": true }
  },
  "groupBy": ["SeriesInstanceUID"],
  "sortBy": ["sliceDistance"]
}
```

- `sliceDistance` uses one origin for the full series, so the order does not
  change with the arrival order of the instances.
- An image outside the dominant plane has no `sliceDistance`. For that image,
  the sort entry gives `0`, and the default order applies.

### Example 5: small DX / CR series, with a configured limit

```jsonc
"displaySetContext": {
  "dxCrMaxImages": 9,
  "isSmallSeries": "seriesInstanceCount <= dxCrMaxImages"
},
"splitRules": {
  "$merge": {
    "dxCrSingleImages": {
      "priority": -1,
      "viewportTypes": ["stack"],
      "matches": { "Modality": ["DX", "CR"], "isStackImage": true, "isSmallSeries": true },
      "groupBy": ["SeriesInstanceUID", "SOPInstanceUID"]
    }
  }
}
```

- A site changes the limit for all rules with `"dxCrMaxImages": { "$set": 20 }`.
  One rule changes the limit for itself with `"context": { "dxCrMaxImages": 20 }`.
- The FU Berlin rule "split a CR series only into images of the same size and
  orientation" needs no new function. That rule adds `Rows`, `Columns` and
  `ImageOrientationPatient` to `groupBy`.

### Example 6: values over the instances of the display set

```jsonc
"attributes": {
  "maxFrames": { "expression": "displaySet.instances.max(NumberOfFrames)" },
  "frameTotal": { "expression": "displaySet.instances.sum(NumberOfFrames)" },
  "seriesFrames": { "expression": "series.instances.sum(NumberOfFrames)" },
  "label": { "template": "{SeriesDescription} #{splitNumber}" },
  "isClip": true
}
```

- In `attributes`, `displaySet.instances.*(...)` runs over the instances of
  the display set, and `series.instances.*(...)` over the instances of the
  series.
- A tag keyword in `attributes` reads the value of the first instance of the
  sorted group.
- `"label": "SCOUT"` is a compile error. Fixed text is
  `{ "template": "SCOUT" }`.

### Example 7: an "or", and a declaration

```jsonc
"displaySetContext": {
  "isBreastImage": "Modality == 'MG' || (Modality == 'CT' && lower(BodyPartExamined) == 'breast')",
  "pixelCount": "Rows * Columns",
  "siemensBValue": { "attribute": "00191010", "vr": "FD", "vm": "1" }
},
"matches": {
  "isBreastImage": true,
  "pixelCount": { "greaterThan": 4000000 },
  "siemensBValue": { "notNull": true }
}
```

- A site replaces the breast test with `"isBreastImage": { "$set": "..." }`,
  and changes the threshold with
  `"pixelCount": { "greaterThan": { "$set": 2000000 } }`.
- The private tag of dcmjs 1.0 reads a private block as one value, by the group
  and the creator. Then a declaration can read the block, and a path can read
  one element of the block:
  `"bValuesGroup": { "attribute": "0019:Siemens b values group" }` and
  `"siemensBValue": "bValuesGroup.0010"`. This syntax can change before dcmjs
  1.0 is released.

### Example 8: the code form

```ts
createDisplaySetSplitRules(selector, {
  displaySetContext: {
    // A code entry with the instance scope.
    mammoView: (instance) => readMammoView(instance),
    // A group in code, with declared fields.
    sweepSummary: {
      function: {
        compute: summarizeSweeps,
        fields: { count: 'series', sweep: 'instance' },
      },
    },
  },
  sortFunctions: {
    byInstanceNumberDescending: (a, b) => b.InstanceNumber - a.InstanceNumber,
  },
});
```

```ts
{
  matches: { Modality: 'PT', isStackImage: true },     // data
  groupBy: ['SeriesInstanceUID', frameOfReferenceGroup], // data and code
  sortBy: [{ sortFunction: 'byInstanceNumberDescending' }],
  attributes: { label: { template: 'PET {mammoView}' } },
}
```

A later `$merge` of `{ "priority": 2 }` from a JSON module changes only the
priority, and keeps the function of `groupBy`.

## Open questions

1. **Hanging protocol migration.** The later OHIF pull request must state the
   change of `greaterThan` from `>=` to `>`, and of `lessThan` from `<=` to
   `<`, as a change of the behaviour that the user sees, with a migration
   note. Two more operator changes go in that note: `containsAll` accepts a
   scalar and a single value and compares with `==`, where `validator.js`
   needs two arrays; and the operand wrappers of `validator.js`
   (`{ "value": x }`, `[x]` for `greaterThan`) are compile errors.
2. **JSON Schema.** The schema can list the tag keywords, the pattern of a
   context name, and the `vr` and `vm` of each declaration. The schema can
   then check an operator against the VR (for example `greaterThan` on a text
   VR).
3. **Private blocks of dcmjs 1.0.** The syntax of a declaration of a private
   block, and of a path to one element of the block, is not final.
4. **Multiframe instances.** A per-frame subject (frames of one instance) is
   future work in the split engine. The rule language needs no change for it:
   the consumer gives a different subject.
