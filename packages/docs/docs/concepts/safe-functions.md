---
id: safe-functions
title: Safe Functions
summary: A serializable vocabulary of conditions and values, compiled into predicates without eval — shared by display-set split rules and any other feature that would otherwise hand-write matching code
---

# Safe Functions

A **safe function** is a predicate or value reader compiled from data rather than
written in JavaScript. There is no `eval`, no `new Function`, and no other path
from definition to executed code — the expression form is tokenized, parsed and
compiled to a closure tree, and the structural form is assembled from a closed
set of operators. Both are CSP-compatible.

That property is what makes a definition _transportable_. Rules expressed this
way can be read from a config file, served over HTTP, stored in an application's
customization layer, or shared between a back end and a browser, without either
side trusting the other to run code.

```js
import { compileCondition, compileExpression } from '@cornerstonejs/metadata';

const isLargeCT = compileCondition("Modality === 'CT' && Rows > 512");

isLargeCT({ Modality: 'CT', Rows: 1024 }); // true
```

There are two ways to write the same thing, and they compile to the same kind of
closure:

|                | Written as                                                                                    | Best at                                                                                           |
| -------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Expression** | `"Modality === 'CT' && Rows > 512"`                                                           | authoring and reading — the condition is one line                                                 |
| **Structural** | `{ all: [{ attribute: 'Modality', equals: 'CT' }, { attribute: 'Rows', greaterThan: 512 }] }` | being _inspected and edited as data_ — a UI can list it, a customization can `$merge` one operand |

Prefer the expression form when a human writes and reads the rule. Reach for the
structural form when something other than a human has to take it apart: the
Display Set Rules example describes each rule's `groupBy` parts in its UI, and an
OHIF customization edits a rule field by field — neither can see inside a string.

The vocabulary knows nothing about display sets, hanging protocols or DICOM. It
describes tests and values over _a subject object_ — whatever the consumer hands
it. Display-set split rules are the first consumer and the worked example below;
hanging protocols are the intended next one.

## The expression language

A small, safe subset of JavaScript expressions, parsed by a hand-written
tokenizer and recursive-descent parser (`safeFunctions/expression`).

```js
"Modality === 'CT' && Rows > 512";
"Modality in ['CR', 'DX', 'MG']";
'DiffusionBValue != undefined';
'context.series.mixedBValue';
"Rows > 2000 ? 'large' : 'small'";
'`${PatientName} (${Modality})`';
```

- **Literals** — numbers (including `1e3` / `2.5E-3`), quoted strings, template
  literals with `${}` interpolation, arrays, `true` / `false` / `null` /
  `undefined`.
- **Operators** — `+ - * / %`, `< <= > >=`, `=== !== == !=`, `&& || !`,
  ternaries, and `in` for membership. Loose equality is deliberately restricted
  to the useful cases: `null` and `undefined` are equivalent, and number/string
  pairs coerce; the rest of the JS `==` table does not apply.
- **Identifiers** — resolved against the named parameters first, then against
  the fields of the first argument. So `Modality` reads `subject.Modality`, and
  an unknown identifier is `undefined` rather than an error, which is what makes
  sparse DICOM tags usable (`DiffusionBValue != undefined`).
- **Member access** — guarded: `__proto__`, `prototype` and `constructor` are
  rejected at parse time, so an expression cannot walk out to the prototype
  chain.
- **Helpers** — `defined`, `includes`, `startsWith`, `endsWith`, `abs`, `min`,
  `max`, `round`, `floor`, `ceil`, `Number`, `String`, plus the aggregates
  `some(list, expr)`, `every(list, expr)`, `count(list, expr)`,
  `minOf(list, expr)`, `maxOf(list, expr)` and `sumOf(list, expr)`. Nothing else
  is callable — `alert(1)` and `a.toString()` are syntax errors.

A malformed expression throws an `ExpressionSyntaxError` **at compile time**,
quoting the source. Runtime errors warn once and yield `undefined` rather than
taking the surrounding operation down.

Positional arguments bind to `options.params`, default `['instance', 'context']`
— which is why `context.series.mixedBValue` reaches a derived fact.

## The structural vocabulary

### Conditions (`RawCondition`)

Exactly one form per object.

| Form                                                                     | Meaning                                                                                              |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `"Rows > 512"` or `{ expression: 'Rows > 512' }`                         | an expression (above). A bare string is unambiguous here because no other condition form is a string |
| `{ classifier: 'video' }`                                                | a named classifier the caller registered                                                             |
| `{ seriesFact: 'mixedBValue' }`                                          | a named fact the caller derived and put on the context                                               |
| `{ attribute: 'Rows', exists: true }` / `{ absent: true }`               | presence test (`undefined`, `null` and `''` all count as absent)                                     |
| `{ attribute: 'Modality', equals: 'CT' }` / `notEquals`                  | loose equality — compared as strings, so `'30'` matches `30`                                         |
| `{ attribute: 'Modality', in: ['CT', 'MR'] }` / `notIn`                  | membership                                                                                           |
| `{ attribute: 'SeriesDescription', contains: 'flow', ignoreCase: true }` | substring; `containsAny` takes a list                                                                |
| `{ attribute: 'NumberOfFrames', greaterThan: 1 }` / `lessThan`           | numeric comparison; false when the value is not finite                                               |
| `{ all: [...] }` / `{ any: [...] }` / `{ not: {...} }`                   | composition — `all: []` is true, `any: []` is false                                                  |

Multi-valued attributes compare on their first value, which is what a
single-valued attribute degrades to when a source delivers it as a one-element
array.

### Values (`RawValue`)

Used wherever a definition needs a value rather than a boolean. A bare string is
shorthand for `{ attribute: <string> }`.

| Form                                             | Yields                                                           |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| `'SeriesInstanceUID'`                            | the attribute, as-is — **not** an expression; see the note below |
| `{ expression: 'Rows * Columns' }`               | whatever the expression evaluates to, uncoerced                  |
| `{ attribute: 'InstanceNumber', number: true }`  | the value coerced to a finite number, else `undefined`           |
| `{ attribute: 'DiffusionBValue', absent: true }` | `true`/`false` for absent/present                                |
| `{ attribute: 'Rows', bucket: 64 }`              | `Math.round(Rows / 64)` — a deliberately fuzzy bucket            |
| `{ condition: {...} }`                           | the boolean result of a condition                                |
| `{ template: 'US series {InstanceNumber}' }`     | a string with `{Attribute}` placeholders substituted             |
| `{ join: '&', parts: [...] }`                    | several values as one string (`rows=8&cols=8`)                   |

A template substitutes and nothing else — no arithmetic, no expression syntax —
so it can never become a route to evaluated code. `\{` escapes a literal brace,
and an absent attribute substitutes an empty string. For anything more, use an
expression with a template literal: `{ expression: '`${Modality} ${Rows}`' }`.

**The one asymmetry to remember**: in condition position a bare string is an
expression; in value position a bare string is an attribute name. Value position
had that meaning first and thousands of `groupBy: ['SeriesInstanceUID']` entries
depend on it, so an expression in value position must use `{ expression }`.

## Named extensions

When a test genuinely cannot be expressed as data — a geometric check, a
free-form heuristic — register it **by name** rather than putting a function in
the definition. The definition stays serializable; only the name crosses the
wire.

```js
const matches = compileCondition(
  { classifier: 'siteProtocol' },
  {
    siteProtocol: (instance) => instance.ProtocolName?.startsWith('SITE-'),
  }
);
```

The names then become part of the contract: whatever compiles the definition —
client or server — must register the same names, or compilation throws. Keep
them few. A definition that is pure data has no such coupling.

## Failure is eager, and names itself

Compilation validates the whole definition up front and throws with the offending
fragment inlined — the structural compiler quoting the JSON, the expression
compiler quoting the source:

```
Invalid safe function definition: unknown classifier "sitProtocol": {"classifier":"sitProtocol"}
Unexpected end of input in expression: Modality ===
```

Compile once, at setup, so a bad definition fails at startup rather than midway
through the work it was supposed to describe.

## The subject is part of the contract too

A compiled predicate can only test attributes the caller actually puts on the
subject. This is worth stating because the failure is silent: a definition that
references an attribute the subject does not carry compiles cleanly, matches
nothing (or groups everything together), and reports no error anywhere.

If two hosts feed the same rules differently shaped subjects — one a full
naturalized DICOM instance, another a trimmed-down projection of it — they will
disagree about the result while both appearing to work. Whatever a definition is
allowed to reference should be documented alongside it.

## Worked example: display-set split rules

`@cornerstonejs/metadata`'s display-set splitting is built on this vocabulary. It
supplies the subject (a naturalized instance), the built-in classifiers
(`image`, `video`, `ecg`, `wsi`), and a rule shape that wraps conditions and
values in `matches` / `groupBy` / `runBy` / `series` / `customAttributes`:

```js
{
  id: 'singleImageModality',
  viewportTypes: ['stack'],
  matches: "Modality in ['CR', 'DX', 'MG'] && Rows != undefined",
  groupBy: [
    'SeriesInstanceUID',
    { join: '&', parts: [{ label: 'rows', attribute: 'Rows', bucket: 64 }] },
  ],
}
```

The default rules ship in structural form — the example UI reads their `groupBy`
parts back to describe each rule, which it could not do through a string — but a
deployment's own rules can be written either way, or mixed as above.

Everything inside `matches` and `groupBy` is safe-function vocabulary; everything
around it is the display-set module's own. See
[Display Sets](./cornerstone-metadata/display-sets.md) for the rule shape, the
default rules, and how a selector is shared between a server and a viewer.

## Where this is headed

Any feature that today ships hand-written matching code is a candidate. Hanging
protocols are the clearest: OHIF's protocol matching has its own parallel
vocabulary of comparators and validators, which means a deployment expressing
"CT with more than 512 rows" writes it twice, in two syntaxes, with two sets of
edge cases. One vocabulary compiled by one compiler removes that duplication and
makes protocol rules as transportable as split rules already are.

OHIF reaches the same compiler through its `$function` customization marker,
which resolves `{ $function: '<expression>' }` (or
`{ $function: { expr, params } }`) at read time into a compiled closure — the
route by which a JSONC customization file, which can hold no functions, declares
behaviour.
