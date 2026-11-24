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
 * What shows the event of a listener: `NEW_IMAGE`, another event, or
 * nothing.
 */
type EventProof = 'newImage' | 'other' | undefined;

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
    return inner.text().slice(1, -1) === NEW_IMAGE_STRING
      ? 'newImage'
      : 'other';
  }

  const path = pathOf(inner);

  if (path === NEW_IMAGE_PATH) {
    return 'newImage';
  }

  return path?.startsWith('Enums.Events.') ? 'other' : undefined;
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
 * gets it. A function that listens to `NEW_IMAGE` and to another event, or
 * to an event that the file does not show, shows nothing.
 */
function listenerEvent(fn: Node, eventParameter: Node | undefined): EventProof {
  const types = annotatedTypes(eventParameter);

  if (types.includes('NewImageEvent')) {
    return 'newImage';
  }

  if (types.some((type) => type.endsWith('Event'))) {
    return 'other';
  }

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

  if (events.every((event) => event === 'newImage')) {
    return 'newImage';
  }

  return events.includes('newImage') ? undefined : 'other';
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

  if (annotatedTypes(declaration).includes('NewImageEventDetail')) {
    return 'newImage';
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
 * Rewrites the `imageIdIndex` entry of one object pattern of a `NEW_IMAGE`
 * detail. A shorthand takes the new name with its uses when the name is
 * free and each use is a plain name, and becomes `sliceIndex: imageIdIndex`
 * otherwise; a shorthand with a default value keeps its local name; a key
 * with a name, quoted or in brackets, keeps its quotes.
 */
function rewritePatternEntry(run: Run, entry: Node): void {
  const kind = entry.kind();
  const label = `NEW_IMAGE detail.${OLD_DETAIL_KEY} -> ${DETAIL_KEY}`;

  if (kind === 'shorthand_property_identifier_pattern') {
    const uses = referencesOf(entry);

    if (
      uses.every((use) => use.kind() === 'identifier') &&
      !isNameTaken(run.rootNode, DETAIL_KEY)
    ) {
      run.edits.add(
        entry.replace(DETAIL_KEY),
        ...uses.map((use) => use.replace(DETAIL_KEY))
      );
    } else {
      run.edits.add(entry.replace(`${DETAIL_KEY}: ${OLD_DETAIL_KEY}`));
    }

    noteRewritten(run, label, entry);

    return;
  }

  if (kind === 'object_assignment_pattern') {
    run.edits.add(
      entry.field('left').replace(`${DETAIL_KEY}: ${OLD_DETAIL_KEY}`)
    );
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

    run.edits.add(string.replace(`${quote}${DETAIL_KEY}${quote}`));
  } else {
    run.edits.add(keyNode.replace(DETAIL_KEY));
  }

  noteRewritten(run, label, entry);
}

/**
 * Returns the `imageIdIndex` entry of an object pattern, or undefined.
 */
function oldKeyEntry(pattern: Node): Node | undefined {
  return pattern.children().find((entry) => {
    const kind = entry.kind();
    const keyNode =
      kind === 'shorthand_property_identifier_pattern'
        ? entry
        : kind === 'object_assignment_pattern'
          ? entry.field('left')
          : kind === 'pair_pattern'
            ? entry.field('key')
            : undefined;

    return staticKeyName(keyNode) === OLD_DETAIL_KEY;
  });
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
      rewritePatternEntry(run, entry);
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
 */
export function rewrite(run: Run): void {
  rewriteDetailMembers(run);
  rewriteDetailPatterns(run);
}
