---
name: display-set-rules
description: Write, review or debug display set split rules of @cornerstonejs/metadata (displaySetRules, createDisplaySetSplitRules, the displaySetContext and the rule context). Use when an author asks for a new split rule, a change to a default rule, a hanging protocol test in the same language, or a fix for a compile error such as "unknown name".
---

# Display set split rules

Use this skill to build a split rule on the default display set context. The
source of truth is `packages/docs/docs/specs/metadata/RuleLanguage.md`. The code
is in `packages/metadata/src/displayset/` (`displaySetContext.ts`,
`compileSplitRules.ts`, `displaySetRules.js`) and
`packages/metadata/src/safeFunctions/`.

## The model in one page

- Each name in a rule is a **tag keyword** (a keyword of the dcmjs DICOM
  dictionary, for example `Modality`) or a **context name** (a lowercase first
  letter, for example `sweepStart`). Every other name is a compile error.
- Names and operators are case sensitive: `modality` fails with "did you mean
  'Modality'?". Value comparisons are case sensitive too; use `containsI` or
  `lower()` to compare text without case.
- A key of `matches` is only a name. A key is never an expression.
- An expression is permitted in two places only: a context entry, and
  `{ "expression": "..." }` in `attributes`.
- An "or" is a context entry; the rule reads its name. `false` on a named
  boolean is "not". There is no `all`, `any`, `not`, `classifier`,
  `seriesFact`, rule `series` list or `compareInstances` data form.
- Arithmetic reads a numeric string as a number, and gives no value when one
  side has no value. `!`, `&&`, `||` read no value as `false`, and `&&`/`||`
  give a boolean. `includes(X, v)` tests whole elements, like the operator;
  `contains(X, 'text')` tests text.
- Missing values have the DICOM meaning: absent is `undefined`; empty is
  `null`, `""`, `[]`; "no value" is either. `X == null` and `"X": null` are "no
  value"; `X == undefined` is "absent" only; `X == defined` and `notNull` are
  "has a value"; `X != undefined` is "present". Two values compared with `==`
  are equal with no value only when of the same kind (`null == undefined` is
  false). Comparisons give `false` on no value. `==` is the only equality, and
  `===` is a compile error.

## Rule fields

```jsonc
"ruleId": {
  "priority": -1,                     // ascending; null excludes the rule
  "viewportTypes": ["stack"],
  "context": { "timeClustersMaxGap": 20 },   // this rule only
  "matches": { "Modality": "US", "sweepCount": { "greaterThan": 1 } },
  "groupBy": ["SeriesInstanceUID", "sweepStart"],
  "sortBy": ["acquisitionSeconds", { "sortFunction": "name" }],
  "attributes": {
    "SeriesDescription": { "template": "{SeriesDescription} +{sweepOffset} s" },
    "maxFrames": { "expression": "displaySet.instances.max(NumberOfFrames)" },
    "isClip": true
  }
}
```

- Tests in `matches`: scalar (`==`), array (`==` with the array: a single value
  is one of the elements, a multi-valued value equals it in order; use
  `includes` for "has one of"), `null` (no value), or one
  operator: `equals`, `doesNotEqual`, `notNull`, `includes`, `doesNotInclude`,
  `greaterThan` (strict), `lessThan` (strict), `range` (`[a, b]`), `contains`,
  `containsI`, `doesNotContain`, `doesNotContainI`, `containsAll`,
  `startsWith`, `endsWith`. A numeric string is a number.
- `attributes`: a string is a name. A keyword reads the first instance of the
  sorted display set. `splitNumber` and `sopClassUids` are readable only here.
  Fixed text is `{ "template": "SCOUT" }`; `"SCOUT"` alone is an error.

## Context entries

Global entries go in `displaySetContext` (option of
`createDisplaySetSplitRules`; in OHIF the `useMetadataDisplaySet`
customization). A rule `context` has the same forms.

| Form                         | Example                                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| fixed value                  | `"dxCrMaxImages": 9`                                                                         |
| expression (names and paths) | `"isSmallSeries": "seriesInstanceCount <= dxCrMaxImages"`                                    |
| declaration                  | `"vendorBValue": { "attribute": "00191010", "vr": "FD", "vm": "1" }`                         |
| template                     | `"label": { "template": "{SeriesDescription} b={bValue}" }`                                  |
| group                        | `"timeClusters": { "function": "timeClusters", "args": { "maxGap": "timeClustersMaxGap" } }` |

- The scope is inferred: a declaration, a code entry, or an expression that
  reads an instance value outside a `series.instances.*(...)` aggregate has
  the instance scope; all others have the series scope (computed one time per
  series).
- Aggregates name the receiver: `series.instances.count()` is the number of
  instances of the series, and `series.instances.max(X)` the maximum over the
  series. `displaySet.instances.max(X)` runs over one display set, in the
  `{ "expression" }` form of `attributes` only. A bare `max(X)` is a compile
  error. `displaySets` is reserved (issue 3000). `series`, `displaySet` and
  `displaySets` cannot be context names.
- A rule entry replaces the global entry for that rule only, also inside the
  global entries that the rule reads. An entry that reads its own name gets
  the global value. `"timeClusters": "longTimeClusters"` selects another group.
- A loop of entries is a compile error. A private, vendor or synthetic
  attribute needs a declaration; a hex tag cannot be read directly.
- In `context`, `matches` and `groupBy`, a series function runs over the
  series. In `sortBy` and `attributes`, `planeGeometry` (`over: 'displaySet'`)
  runs over the display set, and `timeClusters` (`over: 'series'`) over the
  series. A group entry can set `"over"` to read both.
- Only `groupBy` groups: the split key is `[ruleId, ...groupBy values]`. A key
  part is normalized: no value is `null`, `[5]` and `'5'` are `5`.
  `groupBy` takes names, not paths; read a group field through an alias.

## The default context

```jsonc
{
  "timeClustersMaxGap": 30,
  "timeClusters": {
    "function": "timeClusters",
    "args": { "maxGap": "timeClustersMaxGap" },
  },
  "longTimeClusters": { "function": "timeClusters", "args": { "maxGap": 60 } },
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

Code entries: `isImage`, `isVideo`, `isEcg`, `isWsi`, `isStackImage`.

Result fields of the series functions (an instance field gives the value of
the instance at hand):

| Function        | Series fields                                                                                          | Instance fields     |
| --------------- | ------------------------------------------------------------------------------------------------------ | ------------------- |
| `timeClusters`  | `first`, `clusters`, `untimedCount`                                                                    | `time`, `start`     |
| `planeGeometry` | `normal`, `origin`, `spacing`, `regularCount`, `irregularCount`, `positions`, `complete`, `duplicates` | `distance`, `index` |

Other modules add entries. To find them, read the `displaySetContext` that the
host passes to `createDisplaySetSplitRules` (in OHIF, the
`useMetadataDisplaySet.displaySetContext` customization of the loaded modes and
URL customization modules), and the `context` of each rule.

## Code form

- A context entry can be a function `(instance, values) => value` (instance
  scope; `values.Name` reads any name).
- A series code entry is `{ "function": fn }`, called `fn(instances, { args })`
  with nothing else; give it a context value through an argument expression.
  The `function` can also be a definition
  `{ compute, fields: { name: 'series' | 'instance' } }`.
- A loop through a code entry throws a `RuleCompileError` at the first read.
- `deniedNames` (option) lists names that no rule can read.
- A function passes through at every function place: `matches`, a test of a
  `matches` entry `(value, instance, context)`, a `groupBy` entry, a
  `sortBy` entry, a whole `attributes`, and one attribute value
  `(instances, values)`.
- Complex split logic is a new series function in code; the context then gives
  names to its result fields.

## Priorities and optional rules

- The default rules use the priorities `10` to `160`, in steps of 10, and
  `unsupported` is last. A site or optional rule uses a priority below `0`, or a
  number between two defaults that is not a multiple of 10 (for example `79`
  runs just before `volume3d` at `80`). A new default takes a multiple of 10.
- Before you write a rule, check `packages/metadata/rules/optional/`. Each JSON
  file there is an optional rule set (`name`, `notes`, `requires`,
  `displaySetContext`, `rules`). A host turns files on with
  `withOptionalDisplaySetRules(ids)`. After a change to a file, run
  `node packages/metadata/scripts/generate-optional-rules.js`.

## Checklist for a new rule

1. Prefer the existing context names. Add a context entry for each new value,
   with a lowercase name that is not a DICOM keyword.
2. Put a value that only one rule needs in the rule `context`; put a value
   that several rules share in `displaySetContext`.
3. Use `{ "greaterThan": n }` for a strict `>`; use `null` / `notNull` for
   presence. Remember that index `0` is a value.
4. Compile the rules (`createDisplaySetSplitRules`) and read the error: it
   gives the rule, the place and the name.
5. Add a test only for what the user must get, or what the API must do.
