import {
  bracketKey,
  coreImportOf,
  declarationNodeOf,
  isCoreNamespace,
  isNameTaken,
  keptValue,
  methodCall,
  referencesOf,
  staticKeyName,
  topLevelCoreTypes,
  unwrap,
} from '../lib.ts';
import type { Node } from '../lib.ts';
import { noteRewritten, pathOf, report } from '../rules.ts';
import type { Rules, Run } from '../rules.ts';
import {
  constValue,
  functionOfFirstParameter,
  patternSource,
} from './display-sets.ts';

/** What a listener of one of the two mount events of 6.0.0-beta.2 reads now. */
const MOUNT_EVENT_REVIEW =
  'DISPLAY_SETS_CHANGED also fires when an overlay such as a labelmap is added or removed: a listener that cares only for the source adds if (!evt.detail.sourceChanged) return';

/** The key of the `NEW_IMAGE` detail of 6.0.0-beta.2 and its 6.0 name. */
const OLD_DETAIL_KEY = 'imageIdIndex';
const DETAIL_KEY = 'sliceIndex';

/** The text of a `detail.imageIdIndex` that the file does not show to be of `NEW_IMAGE`. */
const DETAIL_KEY_UNPROVEN = `if this is the detail of NEW_IMAGE, the key is ${DETAIL_KEY} now`;

/** The path and the string of `NEW_IMAGE`. */
const NEW_IMAGE_PATH = 'Enums.Events.NEW_IMAGE';
const NEW_IMAGE_STRING = 'CORNERSTONE_NEW_IMAGE';

/**
 * What shows the event of a listener: `NEW_IMAGE`, one of the two out of
 * bounds events of 6.0.0-beta.2, another event, or nothing.
 */
type EventProof =
  | 'newImage'
  | 'stackOutOfBounds'
  | 'volumeOutOfBounds'
  | 'other'
  | undefined;

/** The out of bounds events of 6.0.0-beta.2 by their name, string and types. */
const OUT_OF_BOUNDS_EVENTS: Record<
  string,
  { proof: EventProof; types: string[] }
> = {
  STACK_SCROLL_OUT_OF_BOUNDS: {
    proof: 'stackOutOfBounds',
    types: ['StackScrollOutOfBoundsEvent', 'StackScrollOutOfBoundsEventDetail'],
  },
  VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS: {
    proof: 'volumeOutOfBounds',
    types: [
      'VolumeScrollOutOfBoundsEvent',
      'VolumeScrollOutOfBoundsEventDetail',
    ],
  },
};

/** The new name of the out of bounds events. */
const SCROLL_OUT_OF_BOUNDS = 'SCROLL_OUT_OF_BOUNDS';

/** The keys of the new detail, for the reports. */
const SCROLL_OUT_OF_BOUNDS_DETAIL =
  'the detail is { viewportId, renderingEngineId, displaySetId, volumeId, sliceIndex, numberOfSlices, delta, direction, imageId }';

/**
 * The keys of an old out of bounds detail that have one key in the new
 * detail, by the event.
 */
const OUT_OF_BOUNDS_KEYS: Record<string, Record<string, string>> = {
  stackOutOfBounds: { direction: 'delta' },
  volumeOutOfBounds: { currentImageId: 'imageId' },
};

/** The text of the index of the old details, which is not `sliceIndex`. */
const OLD_INDEX_NOTE =
  'SCROLL_OUT_OF_BOUNDS gives sliceIndex, the position the scroll stopped at (the first or the last), where the old event gave the position before the scroll';

/**
 * The keys of an old out of bounds detail that have no one key in the new
 * detail, by the event, with what to read instead.
 */
const OUT_OF_BOUNDS_DROPPED: Record<string, Record<string, string>> = {
  stackOutOfBounds: { imageIdIndex: OLD_INDEX_NOTE },
  volumeOutOfBounds: {
    currentStepIndex: OLD_INDEX_NOTE,
    desiredStepIndex:
      'SCROLL_OUT_OF_BOUNDS has no requested position: it gives delta and direction (-1 toward the first position, 1 toward the last)',
    numScrollSteps:
      'SCROLL_OUT_OF_BOUNDS gives numberOfSlices, which is numScrollSteps + 1',
    viewport:
      'SCROLL_OUT_OF_BOUNDS gives viewportId and renderingEngineId: getEnabledElementByIds(viewportId, renderingEngineId).viewport',
  },
};

/** What a listener of `VOLUME_VIEWPORT_SCROLL` listens to now. */
const VOLUME_SCROLL_MANUAL =
  'no event fires for each scroll: listen to NEW_IMAGE for the slice that is shown and to CAMERA_MODIFIED for the camera; a scroll stopped at the first or the last slice fires SCROLL_OUT_OF_BOUNDS';

/** The function kinds that a listener can be. */
const LISTENER_KINDS = new Set([
  'arrow_function',
  'function_expression',
  'function',
  'function_declaration',
  'method_definition',
]);

/**
 * Events: the one appearance event in place of `VOI_MODIFIED` and
 * `COLORMAP_MODIFIED`, `DISPLAY_SETS_CHANGED`, `sliceIndex` in the detail of
 * `NEW_IMAGE`, and `SCROLL_OUT_OF_BOUNDS` in place of the three scroll
 * events (lanes EV1, EV2).
 *
 * EV1: `VIEWPORT_NEW_IMAGE_SET` and `VOLUME_VIEWPORT_NEW_VOLUME` become
 * `DISPLAY_SETS_CHANGED`, each site for review, as the new event also fires
 * for an overlay; `StackViewportNewStackEvent` and its detail become the
 * types of the new event.
 *
 * EV2: `STACK_SCROLL_OUT_OF_BOUNDS` and `VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS`
 * become `SCROLL_OUT_OF_BOUNDS`, their four types the two types of the new
 * event; the keys of their detail are rewritten in `rewrite`. Each site of
 * `VOLUME_VIEWPORT_SCROLL` is reported: no event fires for each scroll.
 */
export const rules: Rules = {
  exports: [
    {
      namespace: 'Enums.Events',
      name: 'VIEWPORT_NEW_IMAGE_SET',
      to: 'DISPLAY_SETS_CHANGED',
      value: 'CORNERSTONE_VIEWPORT_NEW_IMAGE_SET',
      review: `${MOUNT_EVENT_REVIEW}, and the detail has no imageIds and no currentImageIdIndex (ask the viewport)`,
    },
    {
      namespace: 'Enums.Events',
      name: 'VOLUME_VIEWPORT_NEW_VOLUME',
      to: 'DISPLAY_SETS_CHANGED',
      value: 'CORNERSTONE_VOLUME_VIEWPORT_NEW_VOLUME',
      review: `${MOUNT_EVENT_REVIEW}, it fires for a stack too, and the detail has no volumeActors (call viewport.getActors())`,
    },
    {
      namespace: 'Types.EventTypes',
      name: 'StackViewportNewStackEvent',
      to: 'DisplaySetsChangedEvent',
      review:
        'the detail has displaySets, sourceDisplaySetId, added, removed and sourceChanged, and no imageIds',
    },
    {
      namespace: 'Types.EventTypes',
      name: 'StackViewportNewStackEventDetail',
      to: 'DisplaySetsChangedEventDetail',
      review:
        'the detail has displaySets, sourceDisplaySetId, added, removed and sourceChanged, and no imageIds',
    },
    ...Object.keys(OUT_OF_BOUNDS_EVENTS).map((name) => ({
      namespace: 'Enums.Events',
      name,
      to: SCROLL_OUT_OF_BOUNDS,
      value: name,
    })),
    {
      namespace: 'Enums.Events',
      name: 'VOLUME_VIEWPORT_SCROLL',
      value: 'VOLUME_VIEWPORT_SCROLL',
      manual: VOLUME_SCROLL_MANUAL,
    },
    ...Object.values(OUT_OF_BOUNDS_EVENTS).flatMap(({ types }) =>
      types.map((name) => ({
        namespace: 'Types.EventTypes',
        name,
        to: name.endsWith('Detail')
          ? 'ScrollOutOfBoundsEventDetail'
          : 'ScrollOutOfBoundsEvent',
        review: SCROLL_OUT_OF_BOUNDS_DETAIL,
      }))
    ),
  ],
  members: [],
  keys: [],
};

/**
 * Tells whether a namespace of a nested type is `Types.EventTypes` of the
 * core, as `Types.EventTypes` or `cornerstone.Types.EventTypes`.
 */
function isCoreEventTypes(namespace: Node | undefined): boolean {
  const parts =
    namespace?.findAll({
      rule: {
        any: [{ kind: 'identifier' }, { kind: 'property_identifier' }],
      },
    }) ?? [];
  const names = parts.map((part) => part.text());

  if (names.length === 2 && names[1] === 'EventTypes') {
    return coreImportOf(parts[0], true)?.name === 'Types';
  }

  return (
    names.length === 3 &&
    names[1] === 'Types' &&
    names[2] === 'EventTypes' &&
    isCoreNamespace(parts[0])
  );
}

/**
 * Returns the core types of the annotation of a declaration: those of
 * `topLevelCoreTypes`, and an event type named through
 * `Types.EventTypes`.
 */
function annotatedTypes(declaration: Node | undefined): string[] {
  const annotation = declaration
    ?.parent()
    ?.children()
    .find((child) => child.kind() === 'type_annotation');
  const typeNode = annotation?.children().find((child) => child.isNamed());
  const named =
    typeNode?.kind() === 'nested_type_identifier'
      ? typeNode.children().filter((child) => child.isNamed())
      : [];

  if (named.length === 2 && isCoreEventTypes(named[0])) {
    return [named[1].text()];
  }

  return topLevelCoreTypes(annotation);
}

/**
 * Returns what shows the event of a listener from the first argument of
 * `addEventListener`: the path of a core event, or the string of one.
 */
function eventOfArgument(argument: Node | undefined): EventProof {
  if (!argument) {
    return undefined;
  }

  const inner = unwrap(argument);

  if (inner.kind() === 'string') {
    const value = inner.text().slice(1, -1);

    if (value === NEW_IMAGE_STRING) {
      return 'newImage';
    }

    return OUT_OF_BOUNDS_EVENTS[value]?.proof ?? 'other';
  }

  const path = pathOf(inner);

  if (path === NEW_IMAGE_PATH) {
    return 'newImage';
  }

  if (!path?.startsWith('Enums.Events.')) {
    return undefined;
  }

  return (
    OUT_OF_BOUNDS_EVENTS[path.slice('Enums.Events.'.length)]?.proof ?? 'other'
  );
}

/**
 * Returns the event that a type of `Types.EventTypes` shows: `NEW_IMAGE`
 * for `NewImageEvent` and its detail, an out of bounds event for one of its
 * types, another event for another event type, and nothing otherwise.
 */
function eventOfType(types: string[]): EventProof {
  if (
    types.includes('NewImageEvent') ||
    types.includes('NewImageEventDetail')
  ) {
    return 'newImage';
  }

  const outOfBounds = Object.values(OUT_OF_BOUNDS_EVENTS).find(
    ({ types: of }) => of.some((type) => types.includes(type))
  );

  if (outOfBounds) {
    return outOfBounds.proof;
  }

  return types.some((type) => type.endsWith('Event')) ? 'other' : undefined;
}

/**
 * Returns the nodes that hand a listener function to a call: the function
 * itself, the uses of its name, and `this.name` in its class for a method or
 * a field that holds it.
 */
function listenerReferences(fn: Node): Node[] {
  const holder = fn.parent();

  if (fn.kind() === 'function_declaration') {
    return [fn, ...referencesOf(fn.field('name'))];
  }

  if (holder?.kind() === 'variable_declarator') {
    return [fn, ...referencesOf(holder.field('name'))];
  }

  const member =
    fn.kind() === 'method_definition'
      ? fn
      : holder?.kind() === 'public_field_definition'
        ? holder
        : undefined;
  const name = member?.field('name')?.text();
  const classBody = member?.parent();

  if (!name || classBody?.kind() !== 'class_body') {
    return [fn];
  }

  const uses = classBody.findAll({
    rule: {
      kind: 'member_expression',
      all: [
        { has: { field: 'object', kind: 'this' } },
        { has: { field: 'property', regex: `^${name}$` } },
      ],
    },
  });

  return [fn, ...uses];
}

/**
 * Returns what shows the event that a function listens to: the type of its
 * event parameter, or the first argument of each `addEventListener` that
 * gets it. A function that listens to `NEW_IMAGE` or to an out of bounds
 * event and to another event, or to an event that the file does not show,
 * shows nothing.
 */
function listenerEvent(fn: Node, eventParameter: Node | undefined): EventProof {
  const typed = eventOfType(annotatedTypes(eventParameter));

  if (typed) {
    return typed;
  }

  return registeredEvent(fn);
}

/**
 * Returns the event of the first argument of each `addEventListener` that
 * gets a function: the one event when they agree, another event when each
 * is an event that this family does not rewrite, and nothing otherwise.
 */
function registeredEvent(fn: Node): EventProof {
  const events: EventProof[] = [];

  for (const reference of listenerReferences(fn).map(keptValue)) {
    const args = reference.parent();
    const call = args?.parent();
    const parts =
      args?.kind() === 'arguments' && call?.kind() === 'call_expression'
        ? methodCall(call)
        : undefined;

    if (
      parts?.method === 'addEventListener' &&
      parts.args[1]?.id() === reference.id()
    ) {
      events.push(eventOfArgument(parts.args[0]));
    }
  }

  if (!events.length || events.includes(undefined)) {
    return undefined;
  }

  return new Set(events).size === 1 ? events[0] : undefined;
}

/**
 * Returns the function or the class method whose first parameter is a
 * declaration: a name, or a destructuring pattern of it.
 */
function listenerOfParameter(declaration: Node): Node | undefined {
  const fn = functionOfFirstParameter(declaration);

  if (fn) {
    return fn;
  }

  const parameter = declaration.parent();
  const parameters = parameter?.parent();
  const method = parameters?.parent();
  const first = parameters?.children().find((child) => child.isNamed());

  return (parameter?.kind() === 'required_parameter' ||
    parameter?.kind() === 'optional_parameter') &&
    parameters?.kind() === 'formal_parameters' &&
    method?.kind() === 'method_definition' &&
    first?.id() === parameter.id()
    ? method
    : undefined;
}

/**
 * Returns what shows the event of a declaration that is the event parameter
 * of a listener, or a pattern of it.
 */
function parameterEvent(declaration: Node | undefined): EventProof {
  const fn = declaration ? listenerOfParameter(declaration) : undefined;

  return fn ? listenerEvent(fn, declaration) : undefined;
}

/**
 * Returns what shows the event of an expression that holds an event: the
 * event parameter of a listener, or a `const` that holds it.
 */
function eventOfExpression(node: Node, depth = 0): EventProof {
  const inner = unwrap(node);

  if (inner.kind() !== 'identifier' || depth > 3) {
    return undefined;
  }

  const value = constValue(inner);

  return value
    ? eventOfExpression(value, depth + 1)
    : parameterEvent(declarationNodeOf(inner));
}

/**
 * Returns what shows the event of an expression that holds the detail of an
 * event: `evt.detail` of an event, `detail` destructured from one, a value
 * typed `NewImageEventDetail`, or a `const` that holds one of these.
 */
function detailEvent(node: Node, depth = 0): EventProof {
  const inner = unwrap(node);

  if (depth > 3) {
    return undefined;
  }

  if (
    inner.kind() === 'member_expression' &&
    inner.field('property')?.text() === 'detail'
  ) {
    return eventOfExpression(inner.field('object'));
  }

  if (inner.kind() !== 'identifier') {
    return undefined;
  }

  const declaration = declarationNodeOf(inner);
  const typed = eventOfType(
    annotatedTypes(declaration).filter((type) => type.endsWith('Detail'))
  );

  if (typed) {
    return typed;
  }

  const value = constValue(inner);

  if (value) {
    return detailEvent(value, depth + 1);
  }

  return declaration ? destructuredDetailEvent(declaration) : undefined;
}

/**
 * Returns what shows the event of a name that a pattern takes out of the
 * `detail` of an event: `{ detail }` or `{ detail: name }` of the event
 * parameter, or of a `const` pattern of an event.
 */
function destructuredDetailEvent(declaration: Node): EventProof {
  const entry =
    declaration.kind() === 'shorthand_property_identifier_pattern'
      ? declaration
      : declaration.parent()?.kind() === 'pair_pattern'
        ? declaration.parent()
        : undefined;
  const key =
    entry?.kind() === 'pair_pattern'
      ? staticKeyName(entry.field('key'))
      : entry?.text();
  const pattern = entry?.parent();

  if (key !== 'detail' || pattern?.kind() !== 'object_pattern') {
    return undefined;
  }

  return patternEvent(pattern);
}

/**
 * Returns what shows the event of an object pattern of an event: the
 * pattern of the event parameter, or the pattern of a `const` whose value
 * holds the event.
 */
function patternEvent(pattern: Node): EventProof {
  const source = patternSource(pattern);

  return source.id() === pattern.id()
    ? parameterEvent(pattern)
    : eventOfExpression(source);
}

/**
 * Tells whether an expression reads like the detail of an event: `x.detail`
 * or a name `detail`.
 */
function looksLikeDetail(node: Node): boolean {
  const inner = unwrap(node);

  return (
    (inner.kind() === 'member_expression' &&
      inner.field('property')?.text() === 'detail') ||
    (inner.kind() === 'identifier' && inner.text() === 'detail')
  );
}

/**
 * Returns the source of an object pattern of a detail and whether it reads
 * like one, with what shows its event: `const { imageIdIndex } = detail`, or
 * `{ detail: { imageIdIndex } }` of an event.
 */
function patternDetail(
  pattern: Node
): { detailLike: boolean; event: EventProof } | undefined {
  const source = patternSource(pattern);

  if (source.id() !== pattern.id()) {
    return { detailLike: looksLikeDetail(source), event: detailEvent(source) };
  }

  const pair = pattern.parent();
  const outer = pair?.parent();

  if (
    pair?.kind() !== 'pair_pattern' ||
    pair.field('value')?.id() !== pattern.id() ||
    staticKeyName(pair.field('key')) !== 'detail' ||
    outer?.kind() !== 'object_pattern'
  ) {
    return undefined;
  }

  return { detailLike: true, event: patternEvent(outer) };
}

/**
 * Rewrites `detail.imageIdIndex` and `detail['imageIdIndex']` of a
 * `NEW_IMAGE` listener, and reports one that reads like a detail of an
 * event the file does not show.
 */
function rewriteDetailMembers(run: Run): void {
  for (const node of run.rootNode.findAll({
    rule: {
      any: [
        {
          kind: 'member_expression',
          has: { field: 'property', regex: `^${OLD_DETAIL_KEY}$` },
        },
        {
          kind: 'subscript_expression',
          has: {
            field: 'index',
            regex: `^['"]${OLD_DETAIL_KEY}['"]$`,
          },
        },
      ],
    },
  })) {
    const isBracket = node.kind() === 'subscript_expression';
    const keyNode = isBracket ? node.field('index') : node.field('property');
    const object = node.field('object');

    if (
      !keyNode ||
      !object ||
      (isBracket && bracketKey(node) !== OLD_DETAIL_KEY) ||
      run.handled.has(keyNode.range().start.index)
    ) {
      continue;
    }

    const event = detailEvent(object);

    if (event === 'newImage') {
      const quote = isBracket ? keyNode.text()[0] : '';

      if (run.edits.add(keyNode.replace(`${quote}${DETAIL_KEY}${quote}`))) {
        noteRewritten(
          run,
          `NEW_IMAGE detail.${OLD_DETAIL_KEY} -> ${DETAIL_KEY}`,
          keyNode
        );
      }
    } else if (event === undefined && looksLikeDetail(object)) {
      report(
        run,
        'manual',
        `detail.${OLD_DETAIL_KEY}: ${DETAIL_KEY_UNPROVEN}`,
        keyNode
      );
    }
  }
}

/**
 * Rewrites the entry of a key of one object pattern of a detail to its new
 * key: `imageIdIndex` of a `NEW_IMAGE` detail to `sliceIndex`, and the keys
 * of an out of bounds detail. A shorthand takes the new name with its uses
 * when the name is free and each use is a plain name, and becomes
 * `newKey: oldKey` otherwise; a shorthand with a default value keeps its
 * local name; a key with a name, quoted or in brackets, keeps its quotes.
 */
function rewritePatternEntry(
  run: Run,
  entry: Node,
  oldKey: string,
  newKey: string,
  label: string
): void {
  const kind = entry.kind();

  if (kind === 'shorthand_property_identifier_pattern') {
    const uses = referencesOf(entry);

    if (
      uses.every((use) => use.kind() === 'identifier') &&
      !isNameTaken(run.rootNode, newKey)
    ) {
      run.edits.add(
        entry.replace(newKey),
        ...uses.map((use) => use.replace(newKey))
      );
    } else {
      run.edits.add(entry.replace(`${newKey}: ${oldKey}`));
    }

    noteRewritten(run, label, entry);

    return;
  }

  if (kind === 'object_assignment_pattern') {
    run.edits.add(entry.field('left').replace(`${newKey}: ${oldKey}`));
    noteRewritten(run, label, entry);

    return;
  }

  const keyNode = entry.field('key');
  const string =
    keyNode?.kind() === 'computed_property_name'
      ? keyNode.children().find((child) => child.kind() === 'string')
      : keyNode?.kind() === 'string'
        ? keyNode
        : undefined;

  if (string) {
    const quote = string.text()[0];

    run.edits.add(string.replace(`${quote}${newKey}${quote}`));
  } else {
    run.edits.add(keyNode.replace(newKey));
  }

  noteRewritten(run, label, entry);
}

/**
 * Returns the name of the key of an entry of an object pattern, or
 * undefined for a rest element or a computed key.
 */
function patternEntryKey(entry: Node): string | undefined {
  const kind = entry.kind();
  const keyNode =
    kind === 'shorthand_property_identifier_pattern'
      ? entry
      : kind === 'object_assignment_pattern'
        ? entry.field('left')
        : kind === 'pair_pattern'
          ? entry.field('key')
          : undefined;

  return keyNode ? staticKeyName(keyNode) : undefined;
}

/**
 * Returns the `imageIdIndex` entry of an object pattern, or undefined.
 */
function oldKeyEntry(pattern: Node): Node | undefined {
  return pattern
    .children()
    .find((entry) => patternEntryKey(entry) === OLD_DETAIL_KEY);
}

/**
 * Rewrites `const { imageIdIndex } = evt.detail` and
 * `({ detail: { imageIdIndex } }) => ...` of a `NEW_IMAGE` listener, and
 * reports such a pattern of a detail of an event the file does not show.
 */
function rewriteDetailPatterns(run: Run): void {
  for (const pattern of run.rootNode.findAll({
    rule: { kind: 'object_pattern' },
  })) {
    const entry = oldKeyEntry(pattern);
    const detail = entry ? patternDetail(pattern) : undefined;

    if (!entry || !detail || run.handled.has(entry.range().start.index)) {
      continue;
    }

    if (detail.event === 'newImage') {
      rewritePatternEntry(
        run,
        entry,
        OLD_DETAIL_KEY,
        DETAIL_KEY,
        `NEW_IMAGE detail.${OLD_DETAIL_KEY} -> ${DETAIL_KEY}`
      );
    } else if (detail.event === undefined && detail.detailLike) {
      report(
        run,
        'manual',
        `detail.${OLD_DETAIL_KEY}: ${DETAIL_KEY_UNPROVEN}`,
        entry
      );
    }
  }
}

/**
 * Tells whether a proof is one of the two out of bounds events.
 */
function isOutOfBounds(
  event: EventProof
): event is 'stackOutOfBounds' | 'volumeOutOfBounds' {
  return event === 'stackOutOfBounds' || event === 'volumeOutOfBounds';
}

/** Every key of the old out of bounds details that this family takes. */
const OUT_OF_BOUNDS_OLD_KEYS = [
  ...new Set(
    [
      ...Object.values(OUT_OF_BOUNDS_KEYS),
      ...Object.values(OUT_OF_BOUNDS_DROPPED),
    ].flatMap((keys) => Object.keys(keys))
  ),
];

/**
 * Rewrites a key of the detail of an out of bounds listener that has one
 * key in the new detail, and reports a key that has none for review. A key
 * that the old detail of that event did not have stays.
 */
function applyOutOfBoundsKey(
  run: Run,
  event: 'stackOutOfBounds' | 'volumeOutOfBounds',
  key: string,
  node: Node,
  rewriteTo: (newKey: string) => void
): void {
  const newKey = OUT_OF_BOUNDS_KEYS[event][key];
  const note = OUT_OF_BOUNDS_DROPPED[event][key];

  if (newKey) {
    rewriteTo(newKey);
  } else if (note) {
    report(run, 'review', `detail.${key}: ${note}`, node);
  }
}

/**
 * Rewrites `detail.direction` and `detail['currentImageId']` of an out of
 * bounds listener, and reports the keys that have no new key.
 */
function rewriteOutOfBoundsMembers(run: Run): void {
  const keys = OUT_OF_BOUNDS_OLD_KEYS.join('|');

  for (const node of run.rootNode.findAll({
    rule: {
      any: [
        {
          kind: 'member_expression',
          has: { field: 'property', regex: `^(${keys})$` },
        },
        {
          kind: 'subscript_expression',
          has: { field: 'index', regex: `^['"](${keys})['"]$` },
        },
      ],
    },
  })) {
    const isBracket = node.kind() === 'subscript_expression';
    const keyNode = isBracket ? node.field('index') : node.field('property');
    const key = isBracket ? bracketKey(node) : keyNode?.text();
    const object = node.field('object');

    if (
      !keyNode ||
      !object ||
      !key ||
      run.handled.has(keyNode.range().start.index)
    ) {
      continue;
    }

    const event = detailEvent(object);

    if (!isOutOfBounds(event)) {
      continue;
    }

    applyOutOfBoundsKey(run, event, key, keyNode, (newKey) => {
      const quote = isBracket ? keyNode.text()[0] : '';

      if (run.edits.add(keyNode.replace(`${quote}${newKey}${quote}`))) {
        noteRewritten(
          run,
          `${SCROLL_OUT_OF_BOUNDS} detail.${key} -> ${newKey}`,
          keyNode
        );
      }
    });
  }
}

/**
 * Rewrites the keys of an object pattern of the detail of an out of bounds
 * listener, and reports the keys that have no new key.
 */
function rewriteOutOfBoundsPatterns(run: Run): void {
  for (const pattern of run.rootNode.findAll({
    rule: { kind: 'object_pattern' },
  })) {
    const entries = pattern
      .children()
      .filter((entry) =>
        OUT_OF_BOUNDS_OLD_KEYS.includes(patternEntryKey(entry) ?? '')
      );
    const event = entries.length ? patternDetail(pattern)?.event : undefined;

    if (!isOutOfBounds(event)) {
      continue;
    }

    for (const entry of entries) {
      const key = patternEntryKey(entry);

      if (!key || run.handled.has(entry.range().start.index)) {
        continue;
      }

      applyOutOfBoundsKey(run, event, key, entry, (newKey) =>
        rewritePatternEntry(
          run,
          entry,
          key,
          newKey,
          `${SCROLL_OUT_OF_BOUNDS} detail.${key} -> ${newKey}`
        )
      );
    }
  }
}

/**
 * Returns the function that a listener argument names: an inline function,
 * a function or a `const` of the file, a method or a field of the class of
 * `this.name`, also with `.bind(...)`; undefined for another value.
 */
function listenerFunction(listener: Node, depth = 0): Node | undefined {
  const inner = unwrap(listener);
  const kind = inner.kind();

  if (LISTENER_KINDS.has(kind)) {
    return inner;
  }

  if (depth > 3) {
    return undefined;
  }

  if (kind === 'call_expression') {
    const parts = methodCall(inner);

    return parts?.method === 'bind'
      ? listenerFunction(parts.object, depth + 1)
      : undefined;
  }

  if (kind === 'identifier') {
    const holder = declarationNodeOf(inner)?.parent();

    if (holder?.kind() === 'function_declaration') {
      return holder;
    }

    const value = constValue(inner);

    return value ? listenerFunction(value, depth + 1) : undefined;
  }

  if (
    kind !== 'member_expression' ||
    inner.field('object')?.kind() !== 'this'
  ) {
    return undefined;
  }

  const name = inner.field('property')?.text();
  const member = inner
    .ancestors()
    .find((ancestor) => ancestor.kind() === 'class_body')
    ?.children()
    .find(
      (child) =>
        (child.kind() === 'method_definition' ||
          child.kind() === 'public_field_definition') &&
        child.field('name')?.text() === name
    );

  if (member?.kind() === 'method_definition') {
    return member;
  }

  const value = member?.field('value');

  return value ? listenerFunction(value, depth + 1) : undefined;
}

/**
 * Returns the event parameter of a function: its first parameter, a name or
 * a pattern.
 */
function eventParameterOf(fn: Node): Node | undefined {
  const single = fn.field('parameter');

  if (single) {
    return single;
  }

  const first = fn
    .field('parameters')
    ?.children()
    .find((child) => child.isNamed() && child.kind() !== 'comment');

  if (
    first?.kind() === 'required_parameter' ||
    first?.kind() === 'optional_parameter'
  ) {
    return first.field('pattern') ?? undefined;
  }

  return first;
}

/**
 * Reports for review each `addEventListener` of an out of bounds event whose
 * listener the file does not show to hear only that event: a listener that
 * is not in the file, or that is given to another event too. In a file that
 * listened to both out of bounds events, each listener is reported: both
 * are one event now, so each listener hears a stack, a volume and a video.
 */
function reportOutOfBoundsListeners(run: Run): void {
  const registrations: Array<{
    event: EventProof;
    property: Node;
    listener: Node | undefined;
  }> = [];

  for (const call of run.rootNode.findAll({
    rule: { kind: 'call_expression' },
  })) {
    const parts = methodCall(call);
    const event =
      parts?.method === 'addEventListener'
        ? eventOfArgument(parts.args[0])
        : undefined;

    if (isOutOfBounds(event)) {
      registrations.push({
        event,
        property: parts.property,
        listener: parts.args[1],
      });
    }
  }

  const both = new Set(registrations.map(({ event }) => event)).size > 1;

  for (const { property, listener } of registrations) {
    const fn = listener ? listenerFunction(listener) : undefined;
    const reasons: string[] = [];

    if (!fn) {
      reasons.push('the listener is not in this file');
    } else if (!isOutOfBounds(listenerEvent(fn, eventParameterOf(fn)))) {
      reasons.push(
        'the file does not show that the listener hears only this event'
      );
    }

    if (both) {
      reasons.push(
        'the file listened to both out of bounds events, which are one event now'
      );
    }

    if (reasons.length) {
      report(
        run,
        'review',
        `${SCROLL_OUT_OF_BOUNDS}: ${reasons.join(', ')}; ${SCROLL_OUT_OF_BOUNDS_DETAIL}`,
        property
      );
    }
  }
}

/**
 * The rewrites of this family that no table entry says. They run before the
 * tables of every family; a site they rewrite or report is marked handled
 * (`run.handled`), and the tables leave it.
 *
 * EV1: `imageIdIndex` of the detail of `NEW_IMAGE` becomes `sliceIndex`,
 * in the plain, quoted, destructured and defaulted forms, where the file
 * shows that the detail is of `NEW_IMAGE`: the listener is given to
 * `addEventListener` of `NEW_IMAGE` (inline, by its name, or as `this.x`),
 * or its event is typed `NewImageEvent`. A `detail.imageIdIndex` of a
 * listener of another core event stays; one whose event the file does not
 * show is reported.
 *
 * EV2: in a listener of `STACK_SCROLL_OUT_OF_BOUNDS` or
 * `VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS` that the file shows, in the same
 * forms, `direction` of the stack detail becomes `delta` and
 * `currentImageId` of the volume detail becomes `imageId`; the keys that
 * have no one key in the new detail are reported for review. A listener
 * that the file does not show is reported for review.
 */
export function rewrite(run: Run): void {
  rewriteDetailMembers(run);
  rewriteDetailPatterns(run);
  rewriteOutOfBoundsMembers(run);
  rewriteOutOfBoundsPatterns(run);
  reportOutOfBoundsListeners(run);
}
