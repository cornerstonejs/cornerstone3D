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
and the revised proposal of 16 October, which follows the shape that the
reviewer proposed on 14 October. The reviewer agreed to the answers of that
proposal on 16 October.
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
  `RL-READ-4`. OHIF/Viewers#6386 made the first part of that change: strict
  `greaterThan` and `lessThan`, an `equals` that compares the whole value, an
  `includes` with a single operand, and the same reading of numbers, text and
  no value. The OHIF migration guide _Hanging protocol comparisons_ states the
  change, and lists the differences that remain. A later OHIF pull request
  moves the hanging protocols onto the rule language (`RL-CONS-4`). That pull
  request converts the old form, or gives a warning for the old form.
- A JSON Schema of the rules. A later pull request adds the schema. The
  declarations record `vr` and `vm` for that schema (`RL-CTX-6`).

### Changes from the draft of 13 October

The review of 14 October changed these user requirements: `RL-READ-3`,
`RL-READ-4`, `RL-READ-5`, `RL-CODE-4`, `RL-SCOPE-1`, `RL-SCOPE-6` and
`RL-SCOPE-8`. The review added the groups `RL-VALUE` and `RL-CTX`.
`RL-SCOPE-9` (the deny list) did not change.

Three more user requirements changed after the review of the implementation.
Each change has a reason that the change rule permits:

- `RL-EXT-3`: a named attribute no longer computes a value over a whole
  display set. An `{ "expression" }` value in `attributes` does. Reason: the
  intended behaviour changed. The review of 6 October removed
  `scopeAttributes`, and the reviewer accepted the `{ "expression" }` form on
  16 October.
- `RL-SCOPE-7`: the compile checks a name against the DICOM dictionary and the
  context, and not against an allow list. Reason: the intended behaviour
  changed. The review of 14 October asked that a misspelt keyword is an error,
  and the allow lists went away with the scopes.
- `RL-ERR-3`: a loop through a code entry gives an error at the first read.
  Reason: the earlier text described the behaviour wrongly. The compile cannot
  read inside a code entry, so no compile can find such a loop.

### Changes of 23 October

- `RL-VALUE-5` and `RL-READ-2` change their meaning. Before, a multi-valued
  value compared on its first value, and an array test meant "one of". Now
  `==`, the scalar test and the array test share one equality: a single value
  against an array is "in", and two arrays are equal when they have the same
  elements in the same order. Reason: the intended behaviour changed. A test
  that read only the first value of `ImageType` missed `LOCALIZER` in a later
  position, and "one of" between two arrays meant "overlaps", which is the
  job of `includes`. So `ImageType != 'LOCALIZER'` and
  `{ "doesNotEqual": "LOCALIZER" }` now hold only when no value is
  `LOCALIZER`. Open question 5 lists the places that still read the first
  value.
- `RL-SCOPE-3` and `RL-SCOPE-4` (values that the host supplies at the start of
  a split) are withdrawn. Reason: the intended behaviour changed. The review of
  6 October found that a value such as `rightOnLeft` is a hanging protocol
  decision, and not a split decision. The code has no option for such values.
- `RL-SCOPE-9` names each kind of access that the deny list covers: a name, a
  declaration, and a field of a sequence item. Reason: the earlier text
  ("strict or optional") described the optional access that `RL-SCOPE-8`
  removed.
- `RL-READ-4` lists each operator meaning that is different from
  `validator.js`. Reason: the earlier text ("five operators") described the
  behaviour wrongly. `equals` with an array operand, `containsAll` and the
  operand wrappers are also different.
- `RL-CTX-7`, `RL-CTX-9`, `RL-SHARE-3` and `RL-SCOPE-10` no longer hold
  implementation detail. The detail is in `RL-CTXI-4` (the scope rules),
  `RL-CTXI-12` (where a series function runs), `RL-PKG-2` (no import of the
  display set code) and `RL-NAME-5` (the text of the messages). The meaning
  of the user requirements does not change.
- More user requirements no longer hold implementation detail, with no change
  of meaning:
  - `RL-SCOPE-1` merges the name rules of `RL-SCOPE-1` and `RL-SCOPE-7`: a
    name is in scope or not. The first-letter convention is an implementation
    detail of the scope, now in `RL-NAME-1`. `RL-SCOPE-10` holds the case
    rules only. `RL-SCOPE-7` is removed.
  - `RL-SCOPE-2` asks that each consumer documents its built-in names. Which
    package names them is in `RL-PKG-2`.
  - `RL-SCOPE-5` no longer holds the cost of a series value. `RL-CTXI-7`
    holds it.
  - `RL-EXT-3` states the need: a value over the series and a value over a
    display set.
  - `RL-EXT-5` moves to `RL-CONS-5`.
  - `RL-CODE-4` no longer gives the reason for the second place.
  - `RL-CODE-6` was guidance, and moves to the docs (`display-sets.md`, code
    entries).
  - `RL-ERR-3` states the need: every error shows when the rules load. When
    each check runs is in `RL-CTXI-11` and `RL-NAME-7`.
  - `RL-VALUE-7` no longer holds a history note. Before, `+` read both sides as
    numbers.
  - `RL-API-1` states the intent of the exports, not the names.
  - `RL-SCOPE-3` and `RL-SCOPE-4` are removed from the list; this note records
    the withdrawal.
- `RL-READ-8` changes its meaning: the split key identifies the split group
  in this study in a form that a host can use again, and a change to the
  rules, the series or the implementation can change it without warning.
  Reason: the earlier text promised a key format that the engine does not
  guarantee.

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

### Changes of 26 October

- `RL-VALUE-5`, `RL-READ-2` and `RL-VAL-3` change their meaning again. `==`
  and the scalar test are now strict: a single value equals an array only when
  the array has one element. The array test of a condition map is now a
  shorthand for `includes`. Reason: the intended behaviour changed. The review
  of the OHIF pull request asked for one meaning of `equals` in the rules and
  in the hanging protocols. The hanging protocol `equals` now compares the
  whole value, and its `includes` accepts a scalar operand. So
  `ImageType == 'LOCALIZER'` no longer holds for
  `['ORIGINAL', 'LOCALIZER']`; use `'LOCALIZER' in ImageType`, or
  `{ "includes": "LOCALIZER" }`. `"Modality": ["MR", "CT"]` still holds for
  `'MR'`, and `"ImageType": ["LOCALIZER"]` now holds for
  `['ORIGINAL', 'LOCALIZER']`.

### Changes of 27 October

- `RL-READ-2` and `RL-VALUE-5` change their meaning, and `RL-EXPR-7` adds
  one compile error. The scalar shorthand of a condition map is now `includes`
  (before: the strict `==` of 26 October), so `"ImageType": "LOCALIZER"`
  holds for `['ORIGINAL', 'LOCALIZER']`, as `"ImageType": ["LOCALIZER"]`
  does. The array shorthand stays `includes`. `equals` and `doesNotEqual`
  stay whole-value tests. `==` and `!=` with an array literal of two or more
  values are a compile error that names `in`, so `Modality == ['MR', 'CT']`
  no longer compiles to a quietly false test; the form can open again later.
  Reason: the intended behaviour changed. The review found that the two
  shorthand forms and `==` with a list read differently from what an author
  expects. No default rule changes its result: the default rules use the
  shorthand only on single-valued attributes (`Modality`) and on booleans.
- `viewportTypes` no longer has a meaning in CS3D. No default rule sets it. A
  rule may still have it (an optional array of strings), for its own reasons:
  `createDisplaySetFromGroup` copies it to the display set unchanged, and CS3D
  reads it nowhere. The handler alone decides the display set class and
  `isDisplayable` (`RL-CONS-1`, `RL-CONS-3`). A host chooses the viewport from
  `handler` (a non-image object) and from the instance data (an image). No user
  requirement of this specification named the viewport types, so none changes
  here. The design note of OHIF #6137 and CS3D #2861 changes its user
  requirement `DS-USER-HANDLER-4` ("the viewport types of a rule are hints").
  `viewportTypes` was released on CS3D `main` (#2738), so a caller sees these
  removals: the display set field `preferredViewportType`; the defaults of
  `viewportTypes` (`['stack']` for a rule with none) and their effect on the
  class and `isDisplayable`; the `viewportTypes` option of
  `ImageStackDisplaySet.fromInstances` and `fromImageIds`; the `viewportTypes`
  key of the `customAttributes` context (an attribute can still set
  `viewportTypes`, as plain data); the type `ViewportTypeHint`; the sentinel
  `NO_VIEWPORT_TYPE` (`'none'`); and the functions `getViewportTypesForRule`,
  `getViewportTypesForGroup` and `getPreferredViewportType`.
- `RL-READ-4` no longer lists the meanings that OHIF/Viewers#6386 gave to
  `validator.js`. It now lists the differences that remain, and it points to
  the OHIF migration guide _Hanging protocol comparisons_. Reason: after the
  merge of OHIF/Viewers#6386, the earlier text described the behaviour of
  `validator.js` wrongly. The meaning of the rule language does not change.
- `RL-CTX-9` changes its meaning. Before, a name such as `sliceSpacing` in
  `sortBy` and `attributes` read the display set for `planeGeometry`, and the
  series for `timeClusters`; a group entry chose with `over`. Now a bare name
  always reads the series, and `displaySet.<name>` reads the display set. The
  field `over` is removed. Reason: the intended behaviour changed. The review
  found that one name gave two values, and asked that the display set value is
  explicit.
- `RL-READ-4` adds the operators `greaterThanOrEqual` and `lessThanOrEqual`,
  and lets `equals` and `doesNotEqual` take an array operand. Reason: the
  intended behaviour changed. The review asked that the split rules and the
  hanging protocols give one meaning to each operator name, and the hanging
  protocols have these operators since OHIF/Viewers#6386. A boolean still does
  not equal a number. `RL-READ-4` no longer lists the boolean as a difference:
  after OHIF/Viewers#6394, a boolean in a hanging protocol also equals only
  `'true'` and `'false'`, and not `1` or `0`.

## Definitions

**Subject.** The object that a condition or a value tests or reads. For a split
rule, the subject is one naturalized DICOM instance. For a hanging protocol, the
subject is a study, a display set or an instance.

**Tag keyword.** A keyword of the DICOM dictionary of dcmjs, for example
`Modality`. A rule reads the value of a tag keyword from the instance.

**Context.** A map of named entries. Each entry gives one value. The
**global context** (the `context` option) holds the entries for every rule. The
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
- **RL-READ-2** The author writes the common tests without an operator. The
  shorthand is `includes` in both forms: a scalar holds when the value is the
  scalar or holds it (`"ImageType": "LOCALIZER"` holds for
  `['ORIGINAL', 'LOCALIZER']`); an array holds when a single value is one of
  the elements, or a multi-valued value has one element in common with the
  array; and `null` means "no value". A whole-value test uses `equals`:
  `{ "equals": ["ORIGINAL", "LOCALIZER"] }`.
- **RL-READ-3** A string in a context entry is an expression. A name or a path
  is the simplest expression. A key of a condition map is never an expression.
  A string at every other place of a rule is a name.
- **RL-READ-4** The author uses the operator names of the OHIF hanging protocol
  constraints (`equals`, `includes`, `contains`, `containsI`, `greaterThan`,
  `range`, `notNull`, and the others). Since OHIF/Viewers#6386, the OHIF
  `validator.js` gives most of these operators the meaning that they have
  here: `greaterThan` and `lessThan` are strict (`>` and `<`), a numeric
  string reads as a number, `equals` compares the whole value, `includes`
  accepts a single operand, and `notNull` reads an empty value as no value.
  `greaterThanOrEqual` and `lessThanOrEqual` include the limit (`>=` and `<=`),
  and read a number in the same way as `greaterThan` and `lessThan`. An array
  operand of `equals` and `doesNotEqual` compares the whole array, element by
  element in order, when the value is also an array. These meanings are still
  different from `validator.js`:
  - An operand of the wrong kind is a compile error here: a number operand of
    a text operator (`startsWith: 0`), and a text operand of a number operator
    (`greaterThan: '4'`). `validator.js` reads such an operand as text or as a
    number.
  - `"X": null` and `{ "equals": null }` mean "no value", and `notNull` is the
    exact opposite of `null`. In `validator.js`, the operand `null` skips the
    constraint, and `notNull` reads every operand other than `false` as
    `true`.
  - `containsAll` accepts a scalar operand and a single value, and compares
    with `==`. `validator.js` needs two arrays, and compares with `===`.
  - An empty text and an empty array stay apart, `includes` fails on no
    value, and an empty array operand is a compile error. In `validator.js`,
    `equals: ''` holds on `['']`, `includes: ''` holds on `''`, and
    `contains: []` always fails.
  - The operand wrappers of `validator.js` (`{ "value": x }`, and `[x]` for
    `greaterThan`, `greaterThanOrEqual`, `lessThan` and `lessThanOrEqual`)
    are compile errors.

  The other operators keep the meaning of `validator.js`, except for the rule
  of `RL-VALUE-4`. The section "Known differences from
  `@cornerstonejs/metadata`" of the OHIF migration guide _Hanging protocol
  comparisons_ has the same list, with examples.

- **RL-READ-5** The author writes a test over the instances of a series (for
  example "the series has fewer than 10 instances", "some instances have a
  b-value") as a context entry with a name. The rule reads the name in the same
  way as a tag keyword. The rule does not hold the test inline.
- **RL-READ-6** The reviewer reads a rule and sees every named attribute that
  the rule uses, at the place where the rule uses it.
- **RL-READ-7** `false` on a named boolean is its negation. An "or" is a
  context entry, and the rule reads its name. The rule language has no `all`,
  `any` or `not`.
- **RL-READ-8** Only the `groupBy` values of a rule group instances. The split
  key identifies the split group of a display set in this study, in a form
  that a host can store and use again. A change to the rules, to the series or
  to the implementation can change the split key without warning.

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
  `greaterThanOrEqual`, `lessThan`, `lessThanOrEqual`, `range`) gives `false` when the value has no value, or is not a
  finite number. A numeric string is a number, so `"2" > 1` is `true`. A text
  test (`contains`, `containsI`, `containsAll`, `startsWith`, `endsWith`)
  fails on no value, and its `doesNot...` form holds. `doesNotEqual` and
  `doesNotInclude` hold on no value.
- **RL-VALUE-5** `==` is the only equality. `"1" == 1` is `true`. `===` and
  `!==` are compile errors. A single value equals an array only when the array
  has one element, equal to the value: `['MR'] == 'MR'`, but
  `['ORIGINAL', 'LOCALIZER'] == 'LOCALIZER'` is `false`. Two arrays are equal
  when they have the same elements in the same order. The `equals` operator
  of a condition map uses the same equality. To test that a value is one of a
  list, use `in`, `includes`, or the shorthand of `RL-READ-2`. `==` and
  `!=` with an array literal of two or more values are a compile error, whose
  message names `in`: `Modality == ['MR', 'CT']` reads as "one of", but
  would be quietly false for `'MR'`. A one-value array literal and an array
  value keep the meaning of `==`.
- **RL-VALUE-6** An expression can compare text without case: `lower(text)`
  gives the text in lowercase.
- **RL-VALUE-7** `-`, `*`, `/` and `%` read a numeric string as a number, so
  `"6" - 1` is `5`. When one side has no value or is not a finite number, the
  result has no value. So `null * 512` has no value, and a test such as
  `{ "lessThan": 100 }` on it fails. `+` follows the type of its left operand:
  text on the left (also `''`) joins, so `"2" + 3` is `"23"`, and no value on
  the right joins as `''`; no value on the left gives no value; a number on the
  left adds, so `3 + "2"` is `5`.
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
- **RL-CTX-7** No entry declares a scope. The author can tell from the entry
  alone whether it has one value for the series or one value for each
  instance. The rules of `RL-CTXI-4` decide the scope.
- **RL-CTX-8** A site changes one entry by its name, for example
  `"dxCrMaxImages": { "$set": 20 }`. The site does not copy the expression text
  of a rule into a `$merge`.
- **RL-CTX-9** A rule tests the full series, and describes each display set.
  A bare name always means the value of the series, in every place. In
  `sortBy` and `attributes`, the author reads a value of the display set with
  the `displaySet.` prefix: `displaySet.sliceSpacing` is the lattice of the
  instances of the display set. `matches`, `groupBy` and a context entry
  reject the prefix. `series.instances.*(...)` describes the series in every
  place. `RL-CTXI-12` gives the implementation.

### One language for each consumer (RL-SHARE)

- **RL-SHARE-1** The same condition text, on the same subject and the same
  context, gives the same result in a split rule and in a hanging protocol.
- **RL-SHARE-2** The host registers a named attribute once, and both a split
  rule and a hanging protocol can use the named attribute.
- **RL-SHARE-3** A new consumer (for example a rule for a worklist filter)
  uses the rule language without a change to the rule language. `RL-PKG-2`
  keeps the rule language free of the display set code.
- **RL-SHARE-4** The documentation describes the rule language once. The
  documentation of a consumer describes only the fields of its rules.

### Extension by the caller (RL-EXT)

- **RL-EXT-1** The host supplies named attributes and named sort functions to
  the compile, and a rule uses each one by name.
- **RL-EXT-2** A rule uses a named attribute at every place that accepts a
  name: a condition key, a grouping entry, a sort entry, a display set
  attribute, a template and an expression.
- **RL-EXT-3** A rule can use a value over the whole series, and a value over
  the instances of one display set. A named attribute can read the subject and
  the other names of the context.
- **RL-EXT-4** The author cannot see a difference between a named attribute of
  the host and a built-in named attribute. The syntax is the same.

### Names (RL-SCOPE)

- **RL-SCOPE-1** A name in a rule is in scope or not. The scope holds the
  attributes of the instance (the DICOM keywords, and the attributes that a
  declaration names) and the context names. A name that is not in scope is a
  compile error that names the rule, the place and the name, so a misspelt
  name (`BodyPartExamind`, `sweepStrat`) fails when the rules load. A field
  that a group does not declare is also a compile error. A context name cannot
  be the name of an attribute of the instance, so a context never hides a
  value of the instance. How the scope decides that a name is in scope is an
  implementation detail (`RL-NAME-1`).
- **RL-SCOPE-2** Each consumer documents the built-in names of its rules. The
  host can add context entries.
- **RL-SCOPE-5** A deployment defines computed values from other values, as
  data or as a function.
- **RL-SCOPE-6** A rule reads a value of the display set (`splitNumber`,
  `sopClassUids`) only in `attributes`. A read of such a value at another
  place is a compile error that names the place.
- **RL-SCOPE-8** A rule reads an attribute that the dictionary does not hold
  only through a declaration (`RL-CTX-6`). A rule cannot read a hex tag
  directly. There is no optional access with `?`.
- **RL-SCOPE-9** No rule reads an attribute on the deny list. The deny list
  covers each kind of access:
  - a name in a condition key, `groupBy`, `sortBy`, `attributes`, a template
    or an expression;
  - a declaration of the attribute (`{ "attribute": "PatientName" }`);
  - a field of a sequence item (`OtherPatientIDsSequence[0].PatientID`), also
    a field with a computed name.

  The deny list lets a host keep a value (for example a patient identifier) out
  of every rule. A rule can read a whole sequence as a value, so a host that
  denies an attribute also denies each sequence that holds it: to keep
  `PatientID` out, deny `PatientID` and `OtherPatientIDsSequence`.

- **RL-SCOPE-10** Names and operators are case sensitive, as DICOM keywords
  are. A name is in scope only with the same case. When a name in scope differs
  only in case, the error names it, for example `Modality` for `modality`, and
  `notNull` for `notnull`. A value comparison is case sensitive: `"CT"` does
  not match `"ct"`. `containsI`, `doesNotContainI` and `lower()` compare text
  without case.

### Code for the complex cases (RL-CODE)

- **RL-CODE-1** An extension can put an actual function at every function
  place of a rule, in place of the data for that place.
- **RL-CODE-2** An extension can mix a function at one place with data at the
  other places of the same rule.
- **RL-CODE-3** An extension can write a whole rule as code, with the hooks of
  the consumer, and put that rule in the same rule set as data rules.
- **RL-CODE-4** The compile permits an expression in two places only: a
  context entry, and the `{ "expression": "..." }` form of `attributes`.
- **RL-CODE-5** An expression can read a named attribute by its name.

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
- **RL-ERR-3** Every error of the rule data shows when the rules load, before
  the consumer uses a rule. A loop of entries is an error that names each entry
  of the loop.
- **RL-ERR-4** A string in `attributes` that is not a name (`"SCOUT"`) is a
  compile error. The error names the template form of fixed text.

## Implementation requirements

### Package layout (RL-PKG)

- **RL-PKG-1** The rule language is in `@cornerstonejs/metadata`, in
  `packages/metadata/src/safeFunctions/`. A later release can rename the
  module to `rules/`.
- **RL-PKG-2** No file in `safeFunctions/` imports from `displayset/`, or from
  any other consumer, and no file in `safeFunctions/` knows the DICOM
  dictionary. The consumer gives the reader of each name (`readName`), and
  the consumer, not the rule language, names the built-in values of its rules.
- **RL-PKG-3** The split rule consumer is in `packages/metadata/src/displayset/`:
  - `displaySetContext.ts`: the context, the default context, the name check,
    the binding of the entries, and the cache.
  - `compileSplitRules.ts`: the rule fields, and their mapping onto the
    `SplitRule` hooks.
  - `splitRuleSchema.ts`: the table of the rule fields and forms (internal).
  - `displaySetRules.js`: the default rules, as JSON data.
- **RL-PKG-4** The hanging protocol consumer is in OHIF
  (`HangingProtocolService`), or in a later CS3D package. Either location uses
  only the public API of `RL-API`.

Layout:

```text
packages/metadata/src/
  safeFunctions/              generic, knows no consumer and no dictionary
    values.ts                 isAbsent, isEmpty, hasNoValue, looseEquals
    matchTests.ts             the tests and the operators of a condition map
    compile.ts                compileCondition, compileValue, templates
    schema.ts                 the table machinery and the generic shapes
    expression/               tokenizer, parser, compiler
  displayset/                 consumer 1
    displaySetContext.ts      context, default context, binding, cache
    compileSplitRules.ts      rule fields -> SplitRule hooks
    splitRuleSchema.ts
    displaySetRules.js        default rules as data
    ...engine files, unchanged
```

### Public API (RL-API)

- **RL-API-1** The safe functions export the functions and the types that a
  second consumer, for example the OHIF hanging protocols, needs to use the
  rule language in its own context: to compile its conditions, values,
  templates and expressions with its own reader of names, to check the names of
  an expression, to use the same meaning of no value, and to report the errors
  of the compile. The safe functions export nothing that only the split
  consumer uses, such as the schema tables.
- **RL-API-2** `CompileOptions` holds the path and the name of the definition
  for the messages, the expression scope of the place, and `readName`: the
  function that gives the reader of a name, or throws a compile error for an
  unknown name. The default `readName` reads an own property of the subject.
- **RL-API-3** `CreateDisplaySetSplitRulesOptions` holds:

  ```ts
  type CreateDisplaySetSplitRulesOptions = {
    /** Global context entries, over the entries of defaultMetadataContext. */
    context?: Record<string, ContextEntry>;
    /** Series functions, over planeGeometry and timeClusters. */
    seriesFunctions?: Record<string, SeriesFunction | SeriesFunctionDefinition>;
    /** Names that no rule can read (RL-SCOPE-9, RL-NAME-7). */
    deniedNames?: readonly string[];
    /** Comparators for a sortBy entry { sortFunction: name }. */
    sortFunctions?: Record<string, Comparator>;
  };
  ```

  OHIF reads `context` from the standalone `metadataContext` customization.

- **RL-API-4** The split consumer exports the default rules as data, the
  compiled default rules, the compile functions for a rule set, the default
  metadata context (`defaultMetadataContext`), each SOP class and transfer
  syntax list of the context under the same name, and the handler names
  (`DISPLAY_SET_HANDLER_NAMES`). A name that a release exported stays as a
  deprecated alias when it is renamed. No release exported
  `defaultDisplaySetContext`, so it has no alias.
- **RL-API-5** The split consumer has an active metadata context:
  `setMetadataContext(context)` sets it (`undefined` goes back to
  `defaultMetadataContext`), and `getMetadataContext()` returns it.
  `getContextValue(name, instance, context?)` reads one instance-scope context
  name for one instance, with no rules; a series-scope name is an error.
  `isImageInstance`, `isVideoInstance`, `isEcgInstance` and `isWsiInstance`
  read the entries `isImage`, `isVideo`, `isEcg` and `isWsi` of their
  `context` argument, else of the active context, so the code tests and the
  rules give the same answer. Each context object compiles one time, with the
  context compile of `RL-CTXI`; the cache is keyed by the object.
  `createDisplaySetSplitRules` with no series functions and no deny list reads
  the same cache, so a split and the code tests share one compile.

### Names (RL-NAME)

- **RL-NAME-1** The compile resolves each name in this order: a tag keyword
  (`resolveHexFromKeyword` of `packages/metadata/src/utilities/Tags.ts` gives a
  hex tag), then an entry of the rule context, then an entry of the global
  context, then (in `attributes` only) `splitNumber` and `sopClassUids`.
  Every other name is a compile error. This order is the scope of
  `RL-SCOPE-1`. Today every DICOM keyword starts with an uppercase letter
  except `dBdt`, and every context name starts with a lowercase letter
  (`RL-NAME-3`), but the scope does not depend on the first letter.
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
  `attributes`, the message also names `{ "template": "..." }`. A name that
  differs from a known name only in case gives
  `unknown name 'modality'; did you mean 'Modality'?`, and an operator gives
  `did you mean 'notNull'?`.
- **RL-NAME-6** A keyword or a declaration has no field: `{Modality.foo}` and
  `Modality.foo` are compile errors. An item of a sequence is read with an
  index (`ViewCodeSequence[0].CodeValue`). An index on a group
  (`timeClusters['start']`) is a compile error; a rule reads a group field by
  path.
- **RL-NAME-7** The deny list (`RL-SCOPE-9`) is the option `deniedNames` of
  `createDisplaySetSplitRules`. A rule or a context entry that names a denied
  name is a compile error. The compile checks the `attribute` of each
  declaration against the deny list. The compile checks each field name of a
  path into a sequence item, and a computed field name on a sequence item is a
  compile error when a deny list is set. The `values` of a code entry give `undefined` for a
  denied name, and the logger gives a warning. A code entry also gets the
  instance itself, so the host must not register a code entry that reads a
  denied attribute from the instance.

### Conditions (RL-COND)

- **RL-COND-1** A condition is a map of name to test, or a function. Every
  entry must hold, so `{}` is `true`.
- **RL-COND-2** The test of one map entry is one of:

  | Test                     | The entry holds when                             |
  | ------------------------ | ------------------------------------------------ |
  | scalar                   | `includes`: the value is the scalar, or holds it |
  | array of scalars         | `includes`: one value is in the array            |
  | `null`                   | the value has no value                           |
  | object with one operator | the operator holds (`RL-COND-3`)                 |
  | function                 | `test(value, subject, context)` is true          |

- **RL-COND-3** The operators:

  | Operator                            | Operand                       | The entry holds when                                                          |
  | ----------------------------------- | ----------------------------- | ----------------------------------------------------------------------------- |
  | `equals`                            | scalar, array or `null`       | the whole value, with `==`; an array operand equals an array value in order   |
  | `doesNotEqual`                      | scalar, array or `null`       | `equals` does not hold; no value passes                                       |
  | `notNull`                           | boolean                       | `true`: the value has a value; `false`: the value has no value                |
  | `includes`                          | scalar or array of scalars    | the value has the element, or one of the elements; a single value is an array |
  | `doesNotInclude`                    | scalar or array of scalars    | `includes` does not hold                                                      |
  | `greaterThan`, `lessThan`           | finite number                 | the value is a finite number, and `>` or `<` the operand                      |
  | `greaterThanOrEqual`                | finite number                 | the value is a finite number, and `>=` the operand                            |
  | `lessThanOrEqual`                   | finite number                 | the value is a finite number, and `<=` the operand                            |
  | `range`                             | two finite numbers, any order | the value is a finite number in `[min, max]`                                  |
  | `contains`, `containsI`             | string or array of strings    | one element of the value holds one of the strings (`I`: without case)         |
  | `doesNotContain`, `doesNotContainI` | string or array of strings    | the `contains` form does not hold                                             |
  | `containsAll`                       | scalar or array of scalars    | the value has every element                                                   |
  | `startsWith`, `endsWith`            | string or array of strings    | one element of the value starts or ends with one of the strings               |

- **RL-COND-4** The compile rejects an operand of the wrong kind, a second
  operator, an unknown operator and an empty array test.

### Values (RL-VAL)

- **RL-VAL-1** The value helpers are in `safeFunctions/values.ts`:
  `isAbsent`, `isEmpty`, `hasNoValue` and `looseEquals`. A number is read with
  `toFiniteFirst` of `@cornerstonejs/utils`: it gives `undefined` for no
  value, for a blank string, and for a value that is not a finite number, and
  reads the first value of a multi-valued attribute.
- **RL-VAL-2** A template placeholder is a name or a path. A placeholder with
  no value gives `""`. `\{` and `\}` escape a brace.
- **RL-VAL-3** `looseEquals` (the `==` of expressions, and `equals`):
  two values with no value are equal only when they are of the same kind
  (absent, `null`, `""`, or an empty array); a value with no value is not
  equal to a value with one; a scalar and an array are equal when the array
  has one element, equal to the scalar; two arrays are equal when they have the same length and
  each element is equal in order; a number and a numeric string compare by
  value; other scalars compare as text. The expression compiler gives `X == undefined`, `X == null` and
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
  the arithmetic operators use `toFiniteFirst` (`RL-VALUE-7`); `!`, `&&`, `||` and
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
  the aggregate in its own series entry, and read that name. An aggregate in the
  argument of another aggregate is a compile error, because each level
  multiplies the cost by the number of instances, and a rule from an untrusted
  source could then stop the viewer (`RL-SAFE-1`).
- **RL-EXPR-6** A compiled expression gives one warning and `undefined` for an
  error at run time, except for a `RuleCompileError`, which goes to the
  caller.
- **RL-EXPR-7** An array literal compiles to an array, and `==` gives it the
  meaning of `RL-VAL-3`. An array literal of literals folds into one array.
  Next to `==` or `!=`, an empty array literal is a compile error, and an
  array literal of two or more values is a compile error whose message names
  `in` and `includes(...)`.

### The context (RL-CTXI)

- **RL-CTXI-1** The global context is `defaultMetadataContext` with the
  entries of `options.context` over it. An entry of the options
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

    "revisionChains": { "function": "revisionChains" },
    "revisionChainUid": "revisionChains.active",
    "isActiveRevision": "SOPInstanceUID == revisionChainUid",

    "seriesInstanceCount": "series.instances.count()",
    "isMultiFrame": "NumberOfFrames > 1",

    "imageId": { "attribute": "imageId" },
  }
  ```

  The default context also holds the SOP class and transfer syntax lists
  (`imageSopClassUids`, `videoSopClassUids`, `videoTransferSyntaxUids`,
  `longVideoSopClassUids`, `ecgSopClassUids`, `wholeSlideSopClassUids`,
  `segmentationSopClassUids`, `rtStructureSetSopClassUids`,
  `parametricMapSopClassUids`, `structuredReportSopClassUids`,
  `encapsulatedDocumentSopClassUids`, `bulkAnnotationSopClassUids`,
  `chartSopClassUids`), the number `longVideoMinFrames`, and one expression
  for each kind of object that tests the lists: `isImage`, `isVideo`, `isEcg`,
  `isWsi`, `isSegmentation`, `isRtStructureSet`, `isParametricMap`,
  `isStructuredReport`, `isEncapsulatedDocument`, `isBulkAnnotation` and
  `isChart`. The default context holds no code entry. It declares each
  synthetic attribute that the default rules and the series functions read;
  today that attribute is `imageId`.

- **RL-CTXI-3** Each series function declares its result fields, and the scope
  of each field. An `instance` field is a map keyed by `instanceKey` (the
  `SOPInstanceUID`, else the `imageId`), and a read of the path gives the value
  of the instance at hand. The built-in fields:

  | Function         | Series fields                                                                                          | Instance fields     |
  | ---------------- | ------------------------------------------------------------------------------------------------------ | ------------------- |
  | `timeClusters`   | `first`, `clusters`, `untimedCount`                                                                    | `time`, `start`     |
  | `planeGeometry`  | `normal`, `origin`, `spacing`, `regularCount`, `irregularCount`, `positions`, `complete`, `duplicates` | `distance`, `index` |
  | `revisionChains` |                                                                                                        | `active`            |

  `revisionChains` reads `PredecessorDocumentsSequence` > `ReferencedSeriesSequence`

  > `ReferencedSOPSequence` > `ReferencedSOPInstanceUID` one time for each series.
  > Only a reference to an instance of the same series counts. Each chain end
  > (an instance that no other instance names) starts its own chain, and is its
  > active instance. The split sorts the instances of the series one time, in
  > the default order `sortByInstanceNumber` (`InstanceNumber`, then
  > `SOPInstanceUID`), before the
  > series functions run. The ends are visited in that order, and each end takes
  > its predecessors, directly and through other instances, that no earlier chain
  > took; so in a branch, the first chain end in the default order takes the
  > shared predecessors. The input order never matters. An instance
  > that no end reaches (only in a reference cycle) is its own chain. `active` is
  > the key of the active instance of the chain of each instance. `revisionChainUid` is the alias of
  > `revisionChains.active`, and `isActiveRevision` is
  > `SOPInstanceUID == revisionChainUid`. Only the default rules
  > `encapsulatedDocument` and `chart` read them: they group by
  > `revisionChainUid`, sort the active instance last, and give the display set
  > attribute `activeSopInstanceUid`.

  A series function in code with no declared fields has fields that the
  compile does not check, with the series scope.

- **RL-CTXI-4** The compile infers the scope of each entry (`RL-CTX-7`):
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
  split and the new instances. It finds the new instances by `instanceKey`, so
  an instance that the host naturalizes again is not counted twice.
- **RL-CTXI-9** The logger `cs3d.metadata.displayset.displaySetContext` records
  each replacement and each new name of a rule context at the debug level.
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
- **RL-CTXI-12** A bare name always reads the series: in `sortBy` and
  `attributes`, it reads the runtime of the split. A `displaySet.<name>` (or
  `displaySet.<name>.<field>`, `{displaySet.<name>}` in a template, and
  `displaySet.<name>` in an expression) reads a second runtime
  (`displaySetContextFor`), in which every group runs over the instances of
  the display set, and `series.instances.*(...)` still runs over the instances
  of the split (`RL-CTX-9`). Only `sortBy` and `attributes` accept the prefix;
  `matches`, `groupBy` and a context entry reject it. A group entry has no
  field `over`. The second runtime shares the cache of the split for each value
  that reads no group and no code entry, so such a value is computed one time
  for each split, and not one time for each display set (`RL-SCOPE-5`).
- **RL-CTXI-13** A split key part is normalized, so that two hosts that
  naturalize differently build the same key: no value (absent, `null`, `''`,
  `[]`) is `null`, a one-element array is its element, and a string that is the
  canonical text of a finite number is that number. `'05'` stays text.

### Functions (RL-FN)

- **RL-FN-1** At every function place, an actual function passes through the
  compile as it is. A function place is: a whole condition, a test of a map
  entry, a `groupBy` entry, a `sortBy` entry, a whole `attributes`
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

  | Field                          | Holds                                                       | `SplitRule` hook   |
  | ------------------------------ | ----------------------------------------------------------- | ------------------ |
  | `priority`                     | a finite number, or `null` to exclude the rule              | (rule set entry)   |
  | `id`, `groupId`, `description` | data                                                        | the same names     |
  | `viewportTypes`                | data that CS3D copies to the display set, and does not read | `viewportTypes`    |
  | `handler`                      | a string; any name compiles                                 | `handler`          |
  | `context`                      | the rule context (`RL-CTX-3`)                               | (compile only)     |
  | `matches`                      | a condition                                                 | `matches`          |
  | `groupBy`                      | names                                                       | `groupBy`          |
  | `sortBy`                       | sort entries (`RL-SORT-2`)                                  | `compareInstances` |
  | `attributes`                   | a map of attribute values (`RL-CONS-2`)                     | `customAttributes` |

  Every compiled rule also has the `series` hook of `RL-CTXI-8`.

- **RL-CONS-2** An attribute value is one of:
  - a name. A tag keyword reads the first instance of the sorted display set.
    An instance value of the context reads the same instance. A series value
    is the value of the whole series. `displaySet.<name>` is the value over the
    instances of the display set (`RL-CTXI-12`).
  - a fixed number, boolean or `null`.
  - `{ "template": "..." }`. `{ "template": "SCOUT" }` is fixed text.
  - `{ "expression": "..." }`. `displaySet.instances.*(...)` runs over the
    instances of the display set, `series.instances.*(...)` over the instances
    of the series, and a tag keyword reads the first instance of the display
    set.
  - in code, a function (`RL-FN-4`).
- **RL-CONS-3** `createDisplaySetFromGroup` passes `group.series` to the
  `customAttributes` hook. An attribute reads a bare name over the series, and
  a `displaySet.<name>` over the instances of the display set (`RL-CTX-9`).
  `createDisplaySetFromGroup` copies the `handler` of the rule to the display
  set. The handler decides the class and `isDisplayable`: no handler or
  `image` gives an image stack; `unsupported` gives a base display set that is
  not displayable; any other handler gives a displayable base display set. A
  rule's `viewportTypes` is copied to the display set unchanged, and changes
  nothing else. An image display set also gets `isReconstructable`, with the
  name of the OHIF display set attribute: a first value from the instance
  attributes (`isReconstructableInstances`, which follows OHIF
  `isDisplaySetReconstructable` with the `planeGeometry` series function). A
  clip is not reconstructable, an attribute that sets `isReconstructable` wins,
  and a host may refine the value for display (for example a texture size
  limit). `display-sets.md` lists the known differences from OHIF.
- **RL-CONS-4** The hanging protocol consumer gives its own subject and its
  own reader of a name. OHIF/Viewers#6386 moved most of the hanging protocol
  constraints to the operator meanings of `RL-COND-3`. A later OHIF pull
  request moves the rest (the differences of `RL-READ-4`).
- **RL-CONS-5** Each consumer supplies its own subjects. A host that shares one
  named attribute between two consumers knows which subject the function gets
  from each consumer.

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
  "context": { "timeClustersMaxGap": 20 },
  "matches": {
    "isImage": true,
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
  "context": { "timeClusters": "longTimeClusters" },
  "matches": { "isImage": true, "Modality": "US", "sweepCount": { "greaterThan": 1 } },
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
the value. `irregularImages` is off (`priority: null`). A site turns it on with
`"irregularImages": { "priority": { "$set": -1 } }`, and the rule then puts
the other images of the series into one stack:

```jsonc
"context": {
  "mixesIrregular": "planeGeometry.regularCount >= 3 && planeGeometry.irregularCount > 0 && planeGeometry.complete"
},
"splitRules": {
  "$merge": {
    "regularVolume": {
      "priority": -2,
      "matches": {
        "isImage": true,
        "Modality": ["CT", "MR", "PT", "NM"],
        "mixesIrregular": true,
        "sliceIndex": { "notNull": true }
      },
      "groupBy": ["SeriesInstanceUID"],
      "sortBy": ["displaySet.sliceDistance"],
      "attributes": { "SeriesDescription": { "template": "{SeriesDescription} ({displaySet.sliceSpacing} mm)" } }
    },
    "irregularImages": {
      "priority": null,
      "matches": {
        "isImage": true,
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
- In `matches`, `planeGeometry` runs over the series, so `mixesIrregular`
  tests the full series. In `attributes` and `sortBy`, the `displaySet.`
  prefix runs `planeGeometry` over the display set (`RL-CTX-9`). So
  `{displaySet.sliceSpacing}` is the spacing of the regular slices of this
  display set, and `displaySet.sliceDistance` orders those slices.

### Example 4: `volumeProjectionOrder`

```jsonc
"volume3d": {
  "priority": 90,
  "matches": {
    "isImage": true,
    "Modality": ["CT", "MR", "PT", "NM"],
    "seriesInstanceCount": { "greaterThan": 1 },
    "Rows": { "notNull": true }
  },
  "groupBy": ["SeriesInstanceUID"],
  "sortBy": ["displaySet.sliceDistance"]
}
```

- The rule replaces the default rule `volume3d` under its own id, so the rule
  keeps the default priority 90 and the default `matches`. Only `sortBy` is
  new.
- `displaySet.sliceDistance` runs `planeGeometry` over the display set (`RL-CTX-9`). This
  rule groups by `SeriesInstanceUID`, so the display set holds the full series.
  The origin is the lowest regular slice, so the order does not change with the
  arrival order of the instances.
- An image outside the dominant plane has no `sliceDistance`. That image sorts
  after the images that have a value (`RL-SORT-2`). Two such images keep the
  default order.

### Example 5: small DX / CR series, with a configured limit

```jsonc
"context": {
  "dxCrMaxImages": 9,
  "isSmallSeries": "seriesInstanceCount <= dxCrMaxImages"
},
"splitRules": {
  "$merge": {
    "dxCrSingleImages": {
      "priority": -1,
      "matches": { "Modality": ["DX", "CR"], "isImage": true, "isSmallSeries": true },
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
"context": {
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
createDisplaySetSplitRules(rules, {
  context: {
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
  matches: { Modality: 'PT', isImage: true },     // data
  groupBy: ['SeriesInstanceUID', frameOfReferenceGroup], // data and code
  sortBy: [{ sortFunction: 'byInstanceNumberDescending' }],
  attributes: { label: { template: 'PET {mammoView}' } },
}
```

A later `$merge` of `{ "priority": 2 }` from a JSON module changes only the
priority, and keeps the function of `groupBy`.

## Open questions

1. **Hanging protocol migration.** Partly resolved. OHIF/Viewers#6386 states
   the change of `greaterThan` from `>=` to `>`, and of `lessThan` from `<=`
   to `<`, as a change of the behaviour that the user sees. Its migration note
   is the OHIF migration guide _Hanging protocol comparisons_. The differences
   of `RL-READ-4` stay open. The later OHIF pull request that moves the
   hanging protocols onto the rule language (`RL-CONS-4`) must state each one
   in a migration note. The boolean equality is closed (27 October): a
   boolean equals only `'true'` and `'false'` (`RL-VALUE-5`), and not the
   number `1` or `0`. The OHIF hanging protocols have the same meaning after
   OHIF/Viewers#6394.
2. **JSON Schema.** The schema can list the tag keywords, the pattern of a
   context name, and the `vr` and `vm` of each declaration. The schema can
   then check an operator against the VR (for example `greaterThan` on a text
   VR).
3. **Private blocks of dcmjs 1.0.** The syntax of a declaration of a private
   block, and of a path to one element of the block, is not final.
4. **Multiframe instances.** A per-frame subject (frames of one instance) is
   future work in the split engine. The rule language needs no change for it:
   the consumer gives a different subject.
5. **Multi-valued values outside of equality.** `==`, `equals` and
   `doesNotEqual` read every value (`RL-VALUE-5`), and the shorthand reads
   any value (`RL-READ-2`).
   These places still read a multi-valued value in another way. With
   `EchoNumbers = [1, 2]` and `ImageType = ['ORIGINAL', 'PRIMARY', 'AXIAL']`:

   | Place                                                    | Result today                       | Reads                    |
   | -------------------------------------------------------- | ---------------------------------- | ------------------------ |
   | `<`, `<=`, `>`, `>=`, `greaterThan`, `lessThan`, `range` | `EchoNumbers >= 2` is `false`      | the first value          |
   | `-`, `*`, `/`, `%`, `+`                                  | `EchoNumbers + 0` is `1`           | the first value          |
   | `lower()`, `round()` and the other helpers               | `lower(ImageType)` is `'original'` | the first value          |
   | `sortBy`                                                 | orders by `1`                      | the first value          |
   | `contains`, `startsWith`, `endsWith`, `includes`, `in`   | `true` for `'AXIAL'`               | any value                |
   | a template `{ImageType}`                                 | `'ORIGINAL,PRIMARY,AXIAL'`         | every value, with commas |
   | `{ "equals": [...] }`                                    | equal in order to an array value   | every value              |

   Suggested fixes, one for each row:
   - **Comparisons.** No fix is clearly right. "Any value" (`EchoNumbers >= 2`
     is `true`) matches the array test, but then
     `X > 1 && X < 3` holds for `[0, 5]`, which reads wrong. "Every value"
     makes `EchoNumbers >= 1` hold and `EchoNumbers >= 2` fail, which also
     surprises. The suggested fix: keep the first value, document it, and give
     the author an explicit form: the helpers `minOf(X)` and `maxOf(X)` over
     the values of one attribute, so a rule says `maxOf(EchoNumbers) >= 2`.
   - **Arithmetic.** Keep the first value, as for comparisons. A multi-valued
     operand is rare in arithmetic, and `minOf` and `maxOf` cover the rest.
   - **Text helpers.** Make `lower()` give an array for an array, element by
     element, so `'axial' in lower(ImageType)` reads every value. Keep the
     number helpers on the first value.
   - **`sortBy`.** Keep the first value, and document it. An order needs one
     key for each instance.
   - **Membership tests.** No change. `includes`, `in` and the text tests are
     the "any value" forms on purpose; `==` is equality.
   - **Templates.** Join the values with `\`, the DICOM value separator, so
     the text reads as DICOM text.
   - **`equals` with an array.** Done on 27 October: an array operand is
     equal in order to an array value.
