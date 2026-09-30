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
  the fields of the _implicit scope_, which is the first argument unless the
  place says otherwise. So `Modality` reads `subject.Modality`, and an unknown
  identifier is `undefined` rather than an error, which is what makes sparse
  DICOM tags usable (`DiffusionBValue != undefined`). A place with no implicit
  scope (see below) refuses a bare identifier that is not a parameter.
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

`options.implicitScope` says where a bare identifier that is not a parameter is
read:

| `implicitScope`        | A bare identifier such as `SliceLocation` reads                                      |
| ---------------------- | ------------------------------------------------------------------------------------ |
| omitted, or `true`     | the field of the first argument                                                      |
| a parameter name (`b`) | the field of that argument                                                           |
| `false`                | nothing — it is a compile-time `ExpressionSyntaxError` unless it is a parameter name |

Use `false` where no single argument is "the subject". A comparator is called
`(a, b, context)`, so `SliceLocation - b.SliceLocation` is almost certainly a
mistake; with an implicit scope it would silently mean `a.SliceLocation`, and
with `implicitScope: false` it fails to compile. Inside the element expression of
an aggregate (`count(context.items, Rows > 1)`), bare identifiers always read the
element.

```js
const compare = compileExpression('a.SliceLocation - b.SliceLocation', {
  params: ['a', 'b', 'context'],
  implicitScope: false,
});
```

## The structural vocabulary

### Conditions (`RawCondition`)

Exactly one form per object. An attribute condition has exactly one operator;
`ignoreCase` is a modifier of `contains` / `containsAny` only.

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
expression with a template literal: ``{ expression: '`${Modality} ${Rows}`' }``.

:::note Text composition reaches every attribute, by design
A template — and a template literal in an expression — can interpolate any
attribute the subject carries. That is the point: composing a label out of
attributes is a main reason to write a definition rather than hard-code one.

It also means a definition, not just a display template, decides what text a
host ends up showing. Where the subject is a naturalized DICOM instance, the
patient identifiers sit on it next to the acquisition tags, so a definition can
put them in a label. Nothing here can prevent that without also preventing the
intended use, so it is a property of the vocabulary rather than a defect in it:
a host handing these definitions to its UI should treat them as content under
the same review as any other configuration that decides what a screen says.
:::

**The one asymmetry to remember**: in condition position a bare string is an
expression; in value position a bare string is an attribute name. Value position
had that meaning first and thousands of `groupBy: ['SeriesInstanceUID']` entries
depend on it, so an expression in value position must use `{ expression }`.

Attributes, facts and classifiers are read as **own properties only**. A name
such as `constructor` or `toString` reads the subject's own value — usually
`undefined` — and never a member of `Object.prototype`: so
`{ attribute: 'toString', exists: true }` is false for an empty subject, and
`{ seriesFact: 'constructor' }` is false.

### Inline functions

An actual function is accepted wherever a condition or a value is expected — as
a whole definition, or nested (`{ all: [{ classifier: 'image' }, fn] }`,
`{ join: '&', parts: ['Rows', fn] }`). It passes through as is. That is the
route by which an application that turns its own markers into functions (OHIF's
`$function`) hands them in. A definition that holds a function is no longer
JSON, so it cannot cross the wire; prefer a [named extension](#named-extensions)
when the definition must be shared.

## The schema: one table, strict keys

The forms above are not only documentation. They are one table, the **schema**
(`safeFunctions/schema.ts`), and the compiler reads it: it selects the form of a
fragment from it, checks the keys against it, and builds its error messages
from it. `conditionShape` and `valueShape` are exported, and a consumer that
wraps conditions and values in a shape of its own adds its shapes to the same
kind of table — display-set split rules do, see
[`splitRuleSchema`](./cornerstone-metadata/display-sets.md#the-schema-of-a-rule).

Each entry of the table describes one form: the key that selects it, every key
it allows, which keys are required, which are operators (exactly one) and which
are modifiers (only with their operators), and what kind of data each key holds:

```js
// conditionShape.forms.attribute, abridged
{
  selectBy: 'attribute',
  keys: {
    attribute: { kind: 'string' },
    equals: { kind: 'scalar', role: 'operator' },
    in: { kind: 'scalar', list: true, role: 'operator' },
    contains: { kind: 'string', role: 'operator' },
    ignoreCase: { kind: 'boolean', role: 'modifier', with: ['contains', 'containsAny'] },
    // ...
  },
}
```

The compiler is **strict**, because a key that is silently ignored changes what
a definition means with no trace:

- **An unknown key is a compile error**, anywhere. `{ attribute: 'Modality',
equal: 'CT' }` and `{ attribute: 'Rows', bukket: 64 }` both fail, and the
  message lists the allowed keys.
- **A form the place does not accept is a compile error**, and the message lists
  the accepted forms and the call signature of the place.
- **A key of the wrong kind is a compile error**: `in` must be an array,
  `greaterThan` a finite number, `exists` must be `true`.
- A key named `'*'` in a table allows any key. Its entry says what each value is:
  `literal` keeps the value as is, a shape name compiles each value as that shape.

A place also declares its **expression variables** — an `ExpressionScope` of
`params` and `implicitScope` — so an expression at that place is compiled with
known arguments. `compileCondition` and `compileValue` take the scope, the path
and the name of the definition for messages as a third argument:

```js
compileCondition(
  'a.Rows > b.Rows',
  {},
  {
    path: 'protocol.match',
    definition: 'hanging protocol',
    expression: { params: ['a', 'b'], implicitScope: false },
  }
);
```

## Named extensions

When a test genuinely cannot be expressed as data — a geometric check, a
free-form heuristic — register it **by name** rather than putting a function in
the definition. (A function in the definition is accepted, but the definition
then stops being JSON.) The definition stays serializable; only the name
crosses the wire.

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

Compilation validates the whole definition up front and throws with the path of
the fragment and the fragment inlined — the structural compiler quoting the
JSON, the expression compiler quoting the source:

```text
Invalid safe function definition: unknown classifier "sitProtocol"; known: siteProtocol: {"classifier":"sitProtocol"}
Invalid safe function definition: unknown key 'equal'; allowed: attribute, exists, absent, equals, notEquals, in, notIn, contains, containsAny, greaterThan, lessThan, ignoreCase
Invalid safe function definition: 'ignoreCase' applies only with contains, containsAny: {"attribute":"Modality","equals":"CT","ignoreCase":true}
Unexpected end of input in expression: Modality ===
```

A consumer passes the path and its own name, so a message from inside a
display-set rule reads
`Invalid raw display set selector: rule 'r'.matches.all[1]: unknown key 'equal'; ...`.

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

### Seeing what an expression reads

`collectIdentifiers` returns the identifiers an expression resolves against its
scope, which is what a host needs to decide what to fetch — or to notice an
expression referencing something it does not supply:

```js
import {
  collectIdentifiers,
  parseExpressionSource,
} from '@cornerstonejs/metadata';

collectIdentifiers(parseExpressionSource("Modality === 'CT' && Rows > 512"));
// ['Modality', 'Rows']
```

Only the root of a member chain is a scope lookup, so
`instance.ViewCodeSequence[0].CodeValue` reports just `instance`.

**`compileExpression` does not take a list of permitted attribute names, and
does not reject an unknown attribute.** (It does reject every bare identifier
that is not a parameter when `implicitScope` is `false`: then the set of names
is closed, the parameters. The attributes of a subject are not.) That is
deliberate, for two reasons:

- **The subject is open-ended at runtime.** A naturalized DICOM instance
  carries private tags, vendor additions and per-frame data folded in by the
  naturalizer. No dictionary enumerates it, so validating against one rejects
  expressions that would have worked — a false rejection breaks a deployment,
  where a silent no-match only puzzles one.
- **The compiler is called from where the list is not.** `compileCondition` and
  `compileValue` compile a selector's expressions, and an application's own
  marker (OHIF's `$function`) compiles at customization-read time. None of
  those sites knows the shape of the subject a rule will later run against.

A host that genuinely has a closed subject can build the check it wants from
`collectIdentifiers` in a couple of lines, and choose whether an unknown
identifier is a warning or an error. That decision belongs to whoever knows
what is on the subject.

## Worked example: display-set split rules

`@cornerstonejs/metadata`'s display-set splitting is built on this vocabulary. It
supplies the subject (a naturalized instance), the built-in classifiers
(`image`, `video`, `ecg`, `wsi`), and a rule shape that wraps conditions and
values in `matches` / `groupBy` / `runBy` / `series` / `customAttributes`. A
selector keys each rule by its id and gives it a `priority`:

```js
{
  singleImageModality: {
    priority: 4,
    viewportTypes: ['stack'],
    matches: "Modality in ['CR', 'DX', 'MG'] && Rows != undefined",
    groupBy: [
      'SeriesInstanceUID',
      { join: '&', parts: [{ label: 'rows', attribute: 'Rows', bucket: 64 }] },
    ],
  },
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
