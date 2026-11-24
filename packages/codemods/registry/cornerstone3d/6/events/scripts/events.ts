import type { Codemod, Edit, SgRoot } from 'codemod:ast-grep';
import type TSX from 'codemod:ast-grep/langs/tsx';
import { useMetricAtom } from 'codemod:metrics';
import {
  EditSet,
  HeldMetric,
  analysed,
  bindsAt,
  bracketKey,
  coreImportOf,
  declarationNodeOf,
  isCoreEnum,
  isCoreExport,
  isCoreNamespace,
  isNameTaken,
  isStableBinding,
  keptValue,
  methodCall,
  referencesOf,
  removeProperty,
  site,
  staticKeyName,
  unwrap,
} from './lib.ts';
import type { Node } from './lib.ts';

/** Sites that the reader changes. */
const manual = new HeldMetric(useMetricAtom('cornerstone3d-6-manual'));

/** Rewrites at a decision of the migration guide. */
const review = new HeldMetric(useMetricAtom('cornerstone3d-6-review'));

/** What a listener of one of the two mount events of 5.x reads now. */
const MOUNT_EVENT_NOTE =
  'DISPLAY_SETS_CHANGED also fires when an overlay such as a labelmap is added or removed: a listener that cares only for the source adds if (!evt.detail.sourceChanged) return';

/** What a listener of one of the two out of bounds events of 5.x reads now. */
const OUT_OF_BOUNDS_NOTE =
  'SCROLL_OUT_OF_BOUNDS fires for a stack, a volume in any orientation and a video, from utilities.scroll and from viewport.scroll, on the element and on eventTarget, and not with loop; the detail is { viewportId, renderingEngineId, displaySetId, volumeId, sliceIndex, numberOfSlices, delta, direction, imageId }, and sliceIndex is the position the scroll stopped at';

/** What a listener of a removed per-scroll event listens to now. */
const SCROLL_EVENT_NOTE =
  'no event fires for each scroll: listen to NEW_IMAGE for the slice that is shown and to CAMERA_MODIFIED for the camera; a scroll stopped at the first or the last slice fires SCROLL_OUT_OF_BOUNDS';

/** The removed events that have one event in their place, and why to review. */
const RENAMED_EVENTS: Record<string, { name: string; note: string }> = {
  STACK_NEW_IMAGE: {
    name: 'NEW_IMAGE',
    note: 'NEW_IMAGE also fires for each slice of a volume, and detail.imageIdIndex is detail.sliceIndex',
  },
  VOLUME_NEW_IMAGE: {
    name: 'NEW_IMAGE',
    note: 'detail.imageIndex is detail.sliceIndex',
  },
  VIEWPORT_NEW_IMAGE_SET: {
    name: 'DISPLAY_SETS_CHANGED',
    note: `${MOUNT_EVENT_NOTE}, and the detail has no imageIds and no currentImageIdIndex (ask the viewport)`,
  },
  VOLUME_VIEWPORT_NEW_VOLUME: {
    name: 'DISPLAY_SETS_CHANGED',
    note: `${MOUNT_EVENT_NOTE}, it fires for a stack too, and the detail has no volumeActors (call viewport.getActors())`,
  },
  IMAGE_LOAD_ERROR: {
    name: 'IMAGE_LOAD_FAILED',
    note: 'the detail has no imageIdIndex, a failed prefetch fires it too',
  },
  STACK_SCROLL_OUT_OF_BOUNDS: {
    name: 'SCROLL_OUT_OF_BOUNDS',
    note: `${OUT_OF_BOUNDS_NOTE}: detail.direction is detail.delta, and detail.imageIdIndex (the position before the scroll) has no key`,
  },
  VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS: {
    name: 'SCROLL_OUT_OF_BOUNDS',
    note: `${OUT_OF_BOUNDS_NOTE}: detail.currentImageId is detail.imageId, numScrollSteps is numberOfSlices - 1, and currentStepIndex, desiredStepIndex and viewport have no key (getEnabledElementByIds(viewportId, renderingEngineId).viewport)`,
  },
};

/** The removed events that need the application. */
const REPORTED_EVENTS = new Set([
  'PRE_STACK_NEW_IMAGE',
  'STACK_VIEWPORT_SCROLL',
  'VOLUME_VIEWPORT_SCROLL',
  'PRESET_MODIFIED',
  'ACTORS_CHANGED',
  'CLIPPING_PLANES_UPDATED',
  'DYNAMIC_VOLUME_TIME_POINT_INDEX_CHANGED',
  'DYNAMIC_VOLUME_TIME_POINT_LOADED',
]);

/** The text of a removed event that says what to listen to instead. */
const REPORTED_EVENT_NOTES: Record<string, string> = {
  STACK_VIEWPORT_SCROLL: SCROLL_EVENT_NOTE,
  VOLUME_VIEWPORT_SCROLL: SCROLL_EVENT_NOTE,
};

/**
 * Returns the text of a site of a removed event: its name, and what to
 * listen to instead where there is a note.
 */
function reportedEventText(name: string): string {
  const note = REPORTED_EVENT_NOTES[name];

  return note ? `Events.${name}: ${note}` : `Events.${name}`;
}

/**
 * The strings of the removed events, which a listener can name directly.
 * `IMAGE_LOAD_ERROR` stays in 6.0, but a planar viewport no longer fires it.
 */
const EVENT_STRINGS: Record<string, string> = {
  IMAGE_LOAD_ERROR: 'IMAGE_LOAD_ERROR',
  DYNAMIC_VOLUME_TIME_POINT_INDEX_CHANGED:
    'DYNAMIC_VOLUME_TIME_POINT_INDEX_CHANGED',
  DYNAMIC_VOLUME_TIME_POINT_LOADED: 'DYNAMIC_VOLUME_TIME_POINT_LOADED',
  CORNERSTONE_STACK_NEW_IMAGE: 'STACK_NEW_IMAGE',
  CORNERSTONE_VOLUME_NEW_IMAGE: 'VOLUME_NEW_IMAGE',
  CORNERSTONE_VIEWPORT_NEW_IMAGE_SET: 'VIEWPORT_NEW_IMAGE_SET',
  CORNERSTONE_VOLUME_VIEWPORT_NEW_VOLUME: 'VOLUME_VIEWPORT_NEW_VOLUME',
  CORNERSTONE_PRE_STACK_NEW_IMAGE: 'PRE_STACK_NEW_IMAGE',
  CORNERSTONE_STACK_VIEWPORT_SCROLL: 'STACK_VIEWPORT_SCROLL',
  CORNERSTONE_VIEWPORT_RENDERING_PRESET_MODIFIED: 'PRESET_MODIFIED',
  CORNERSTONE_ACTORS_CHANGED: 'ACTORS_CHANGED',
  CORNERSTONE_CLIPPING_PLANES_UPDATED: 'CLIPPING_PLANES_UPDATED',
  STACK_SCROLL_OUT_OF_BOUNDS: 'STACK_SCROLL_OUT_OF_BOUNDS',
  VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS: 'VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS',
  VOLUME_VIEWPORT_SCROLL: 'VOLUME_VIEWPORT_SCROLL',
};

/** The event types of `Types.EventTypes` that 6.0 renames. */
const RENAMED_EVENT_TYPES: Record<string, string> = {
  StackNewImageEvent: 'NewImageEvent',
  StackNewImageEventDetail: 'NewImageEventDetail',
  VolumeNewImageEvent: 'NewImageEvent',
  VolumeNewImageEventDetail: 'NewImageEventDetail',
  StackViewportNewStackEvent: 'DisplaySetsChangedEvent',
  StackViewportNewStackEventDetail: 'DisplaySetsChangedEventDetail',
  StackScrollOutOfBoundsEvent: 'ScrollOutOfBoundsEvent',
  StackScrollOutOfBoundsEventDetail: 'ScrollOutOfBoundsEventDetail',
  VolumeScrollOutOfBoundsEvent: 'ScrollOutOfBoundsEvent',
  VolumeScrollOutOfBoundsEventDetail: 'ScrollOutOfBoundsEventDetail',
};

/** The key of the detail of `NEW_IMAGE` in 6.0. */
const SLICE_INDEX = 'sliceIndex';

/**
 * The keys of the detail of a 5.x event that have one key in the detail of
 * its 6.0 event: the index of `STACK_NEW_IMAGE` and `VOLUME_NEW_IMAGE`,
 * which is `sliceIndex` of `NEW_IMAGE`, and the keys of the two out of
 * bounds events that `SCROLL_OUT_OF_BOUNDS` keeps under another name.
 */
const DETAIL_KEYS: Record<string, Record<string, string>> = {
  STACK_NEW_IMAGE: { imageIdIndex: SLICE_INDEX },
  VOLUME_NEW_IMAGE: { imageIndex: SLICE_INDEX },
  STACK_SCROLL_OUT_OF_BOUNDS: { direction: 'delta' },
  VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS: { currentImageId: 'imageId' },
};

/** Every 5.x key of `DETAIL_KEYS`. */
const OLD_DETAIL_KEYS = [
  ...new Set(Object.values(DETAIL_KEYS).flatMap((keys) => Object.keys(keys))),
];

/** The 5.x event of each event type and detail type of `Types.EventTypes`. */
const EVENT_OF_TYPE: Record<string, string> = {
  StackNewImageEvent: 'STACK_NEW_IMAGE',
  StackNewImageEventDetail: 'STACK_NEW_IMAGE',
  VolumeNewImageEvent: 'VOLUME_NEW_IMAGE',
  VolumeNewImageEventDetail: 'VOLUME_NEW_IMAGE',
  StackScrollOutOfBoundsEvent: 'STACK_SCROLL_OUT_OF_BOUNDS',
  StackScrollOutOfBoundsEventDetail: 'STACK_SCROLL_OUT_OF_BOUNDS',
  VolumeScrollOutOfBoundsEvent: 'VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS',
  VolumeScrollOutOfBoundsEventDetail: 'VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS',
};

/** The kinds of the function nodes of the syntax tree. */
const FUNCTION_KINDS = new Set([
  'arrow_function',
  'function_expression',
  'function_declaration',
  'function',
  'method_definition',
]);

/** The event types of `Types.EventTypes` that 6.0 removes. */
const REPORTED_EVENT_TYPES = new Set([
  'PreStackNewImageEvent',
  'PreStackNewImageEventDetail',
  'StackViewportScrollEvent',
  'StackViewportScrollEventDetail',
  'ActorsChangedEvent',
  'ActorsChangedEventDetail',
]);

/**
 * The state of one run of the transform on a file.
 */
interface Run {
  root: SgRoot<TSX>;
  rootNode: Node;
  edits: EditSet;
  handled: Set<number>;
}

/**
 * Tells whether an expression is the core `Enums.Events`, also as the core
 * export `EVENTS`, which is the same enum (`import { EVENTS }` or
 * `cornerstone.EVENTS`).
 */
function isCoreEvents(node: Node): boolean {
  return isCoreEnum(node, 'Events') || isCoreExport(node, 'EVENTS');
}

/**
 * Rewrites `Events.STACK_NEW_IMAGE` and its kin, read as a member of the core
 * `Enums.Events` or of `EVENTS`, and `Events['STACK_NEW_IMAGE']`, whose
 * string keeps its quotes.
 */
function rewriteMembers(run: Run): void {
  const names = [...Object.keys(RENAMED_EVENTS), ...REPORTED_EVENTS].join('|');
  const members = run.rootNode.findAll({
    rule: {
      any: [
        {
          kind: 'member_expression',
          has: { field: 'property', regex: `^(${names})$` },
        },
        {
          kind: 'subscript_expression',
          has: { field: 'index', regex: `^['"](${names})['"]$` },
        },
      ],
    },
  });

  for (const node of members) {
    const isBracket = node.kind() === 'subscript_expression';
    const key = isBracket ? node.field('index') : node.field('property');
    const name = isBracket ? bracketKey(node) : key.text();

    if (!isCoreEvents(node.field('object'))) {
      continue;
    }

    run.handled.add(key.range().start.index);

    if (REPORTED_EVENTS.has(name)) {
      manual.increment(site(run.root, reportedEventText(name), node));
      continue;
    }

    const { name: newName, note } = RENAMED_EVENTS[name];
    const quote = isBracket ? key.text()[0] : '';

    if (run.edits.add(key.replace(`${quote}${newName}${quote}`))) {
      review.increment(site(run.root, `Events.${name}: ${note}`, node));
    }
  }
}

/**
 * A local name that a destructuring pattern declares for a key: its node,
 * and its name after this run, which differs for an entry renamed in it.
 */
interface PatternLocal {
  node: Node;
  name: string;
  renamed: boolean;
}

/**
 * Returns the local names of a destructuring pattern by key, with the names
 * that take a default value.
 */
function patternLocals(pattern: Node): Map<string, PatternLocal> {
  const locals = new Map<string, PatternLocal>();

  for (const child of pattern.children()) {
    const shorthand =
      child.kind() === 'object_assignment_pattern'
        ? child.field('left')
        : child;

    if (shorthand?.kind() === 'shorthand_property_identifier_pattern') {
      locals.set(shorthand.text(), {
        node: shorthand,
        name: shorthand.text(),
        renamed: false,
      });
    } else if (child.kind() === 'pair_pattern') {
      const name = staticKeyName(child.field('key'));
      const value = child.field('value');
      const local =
        value?.kind() === 'assignment_pattern' ? value.field('left') : value;

      if (name && local?.kind() === 'identifier') {
        locals.set(name, { node: local, name: local.text(), renamed: false });
      }
    }
  }

  return locals;
}

/**
 * Returns the edit that gives the key of a pair of a pattern a new name. A
 * string key and a string in brackets keep their quotes.
 */
function renameKey(keyNode: Node, newName: string): Edit {
  const string =
    keyNode.kind() === 'computed_property_name'
      ? keyNode.children().find((child) => child.kind() === 'string')
      : keyNode.kind() === 'string'
        ? keyNode
        : undefined;

  if (string) {
    const quote = string.text()[0];

    return string.replace(`${quote}${newName}${quote}`);
  }

  return keyNode.replace(newName);
}

/**
 * Rewrites one shorthand entry `STACK_NEW_IMAGE` of a pattern of the core
 * `Enums.Events`. When the pattern has the new key already and its local
 * name means that binding at every use, the entry goes and its uses take
 * that local name; when the new name is free, the entry and its uses take
 * it; otherwise the entry becomes `NEW_IMAGE: STACK_NEW_IMAGE` and its uses
 * stay.
 */
function rewriteShorthand(
  run: Run,
  entry: Node,
  newName: string,
  locals: Map<string, PatternLocal>
): void {
  const name = entry.text();
  const uses = referencesOf(entry);
  const plainUses = uses.every((use) => use.kind() === 'identifier');
  const existing = locals.get(newName);
  const existingBinds =
    existing &&
    uses.every(
      (use) => existing.renamed || bindsAt(run.rootNode, existing.node, use)
    );

  if (existing && plainUses && existingBinds) {
    run.edits.add(
      removeProperty(entry),
      ...uses.map((use) => use.replace(existing.name))
    );

    return;
  }

  if (!existing && plainUses && !isNameTaken(run.rootNode, newName)) {
    run.edits.add(
      entry.replace(newName),
      ...uses.map((use) => use.replace(newName))
    );
    locals.set(newName, { node: entry, name: newName, renamed: true });

    return;
  }

  run.edits.add(entry.replace(`${newName}: ${name}`));
}

/**
 * Rewrites the names that a file takes out of the core `Enums.Events` or
 * `EVENTS` with a destructuring pattern, and their uses. An entry with a
 * local name keeps
 * it, and only its key changes; a quoted key and a key in brackets keep
 * their quotes, and a shorthand with a default value gets the new key and
 * keeps its local name. A key computed from code and a rest element can
 * take any event, so they are reported.
 */
function rewriteDestructured(run: Run): void {
  const patterns = run.rootNode.findAll({ rule: { kind: 'object_pattern' } });

  for (const pattern of patterns) {
    const declarator = pattern.parent();
    const value =
      declarator?.kind() === 'variable_declarator'
        ? declarator.field('value')
        : undefined;

    if (!value || !isCoreEvents(value)) {
      continue;
    }

    const locals = patternLocals(pattern);

    for (const entry of pattern.children()) {
      const kind = entry.kind();
      const keyNode =
        kind === 'shorthand_property_identifier_pattern'
          ? entry
          : kind === 'object_assignment_pattern'
            ? entry.field('left')
            : kind === 'pair_pattern'
              ? entry.field('key')
              : undefined;
      const name = staticKeyName(keyNode);

      if (kind === 'rest_pattern') {
        manual.increment(site(run.root, 'Events: a rest pattern', entry));
        continue;
      }

      if (keyNode && !name) {
        manual.increment(site(run.root, 'Events: a computed key', entry));
        continue;
      }

      if (keyNode) {
        run.handled.add(keyNode.range().start.index);
        keyNode
          .findAll({ rule: { kind: 'string' } })
          .forEach((string) => run.handled.add(string.range().start.index));
      }

      if (REPORTED_EVENTS.has(name)) {
        manual.increment(site(run.root, reportedEventText(name), entry));
        continue;
      }

      if (!RENAMED_EVENTS[name]) {
        continue;
      }

      const { name: newName, note } = RENAMED_EVENTS[name];

      if (kind === 'shorthand_property_identifier_pattern') {
        rewriteShorthand(run, entry, newName, locals);
      } else if (kind === 'object_assignment_pattern') {
        run.edits.add(keyNode.replace(`${newName}: ${name}`));
      } else {
        run.edits.add(renameKey(keyNode, newName));
      }

      review.increment(site(run.root, `Events.${name}: ${note}`, entry));
    }
  }
}

/**
 * Tells whether the namespace of a nested type is `Types.EventTypes` of the
 * core.
 */
function isCoreEventTypes(namespace: Node): boolean {
  const parts = namespace.findAll({
    rule: { any: [{ kind: 'identifier' }, { kind: 'property_identifier' }] },
  });
  const names = parts.map((part) => part.text());

  if (names.length === 2 && names[1] === 'EventTypes') {
    return coreImportOf(parts[0])?.name === 'Types';
  }

  if (names.length === 3 && names[1] === 'Types' && names[2] === 'EventTypes') {
    return isCoreNamespace(parts[0]);
  }

  return false;
}

/**
 * Rewrites the event types of `Types.EventTypes` that 6.0 renames and
 * reports the removed ones.
 */
function rewriteEventTypes(run: Run): void {
  for (const node of run.rootNode.findAll({
    rule: { kind: 'nested_type_identifier' },
  })) {
    const named = node.children().filter((child) => child.isNamed());
    const namespace = named[0];
    const nameNode = named[named.length - 1];
    const name = nameNode?.text() ?? '';

    if (
      namespace?.kind() !== 'nested_identifier' ||
      (!RENAMED_EVENT_TYPES[name] && !REPORTED_EVENT_TYPES.has(name)) ||
      !isCoreEventTypes(namespace)
    ) {
      continue;
    }

    if (RENAMED_EVENT_TYPES[name]) {
      run.edits.add(nameNode.replace(RENAMED_EVENT_TYPES[name]));
    } else {
      manual.increment(site(run.root, `Types.EventTypes.${name}`, node));
    }
  }
}

/**
 * Returns the 5.x core event that an expression names: a member of the core
 * `Enums.Events` or `EVENTS`, a name destructured from it, or the string of
 * an event; `''` for an expression that names no event the file shows.
 */
function eventName(argument: Node | undefined): string {
  const inner = argument ? unwrap(argument) : undefined;
  const kind = inner?.kind();

  if (kind === 'string') {
    const value = inner.text().slice(1, -1);

    return EVENT_STRINGS[value] ?? value.replace(/^CORNERSTONE_/, '');
  }

  if (kind === 'member_expression' || kind === 'subscript_expression') {
    const name =
      kind === 'subscript_expression'
        ? bracketKey(inner)
        : inner.field('property')?.text();

    return name && isCoreEvents(inner.field('object')) ? name : '';
  }

  const declaration =
    kind === 'identifier' ? declarationNodeOf(inner) : undefined;
  const entry =
    declaration?.parent()?.kind() === 'pair_pattern'
      ? declaration.parent()
      : declaration;
  const pattern = entry?.parent();
  const source =
    pattern?.kind() === 'object_pattern' && isStableBinding(declaration)
      ? patternSource(pattern)
      : undefined;

  if (!source || source.id() === pattern.id() || !isCoreEvents(source)) {
    return '';
  }

  return (
    (entry.kind() === 'pair_pattern'
      ? staticKeyName(entry.field('key'))
      : entry.text()) ?? ''
  );
}

/**
 * Returns the value of a `const` destructuring pattern, or the pattern
 * itself when it is a parameter.
 */
function patternSource(pattern: Node): Node {
  const holder = pattern.parent();

  return holder?.kind() === 'variable_declarator' &&
    holder.field('name')?.id() === pattern.id()
    ? (holder.field('value') ?? pattern)
    : pattern;
}

/**
 * Returns the value of a `const` that a name refers to, or undefined.
 */
function constValue(identifier: Node): Node | undefined {
  const declaration = declarationNodeOf(identifier);
  const holder = declaration?.parent();

  return declaration &&
    holder?.kind() === 'variable_declarator' &&
    holder.field('name')?.id() === declaration.id() &&
    isStableBinding(declaration)
    ? (holder.field('value') ?? undefined)
    : undefined;
}

/**
 * Returns the function or the class method whose first parameter is a
 * declaration: a name, or a destructuring pattern of it.
 */
function listenerOfParameter(declaration: Node): Node | undefined {
  let node = declaration;
  let parent = node.parent();

  if (
    parent?.kind() === 'required_parameter' ||
    parent?.kind() === 'optional_parameter'
  ) {
    node = parent;
    parent = node.parent();
  }

  if (
    parent?.kind() === 'arrow_function' &&
    parent.field('parameter')?.id() === node.id()
  ) {
    return parent;
  }

  const first = parent?.children().find((child) => child.isNamed());
  const fn = parent?.parent();

  return parent?.kind() === 'formal_parameters' &&
    first?.id() === node.id() &&
    fn &&
    FUNCTION_KINDS.has(fn.kind())
    ? fn
    : undefined;
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

  return [
    fn,
    ...classBody.findAll({
      rule: {
        kind: 'member_expression',
        all: [
          { has: { field: 'object', kind: 'this' } },
          { has: { field: 'property', regex: `^${name}$` } },
        ],
      },
    }),
  ];
}

/**
 * Returns the event type of `Types.EventTypes` that annotates a
 * declaration, or undefined.
 */
function annotatedEventType(declaration: Node | undefined): string | undefined {
  const annotation = declaration
    ?.parent()
    ?.children()
    .find((child) => child.kind() === 'type_annotation');
  const typeNode = annotation?.children().find((child) => child.isNamed());
  const named =
    typeNode?.kind() === 'nested_type_identifier'
      ? typeNode.children().filter((child) => child.isNamed())
      : [];

  return named.length === 2 &&
    named[0].kind() === 'nested_identifier' &&
    isCoreEventTypes(named[0])
    ? named[1].text()
    : undefined;
}

/**
 * Returns the 5.x events that a function listens to, by the type of its
 * event parameter or by each `addEventListener` that gets it, or undefined
 * when one of them is an event that the file does not show.
 */
function listenerEvents(
  fn: Node,
  eventParameter: Node | undefined
): string[] | undefined {
  const typed = EVENT_OF_TYPE[annotatedEventType(eventParameter) ?? ''];

  if (typed) {
    return [typed];
  }

  const events: string[] = [];

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
      events.push(eventName(parts.args[0]));
    }
  }

  return events.length && !events.includes('') ? events : undefined;
}

/**
 * Returns the 5.x events of an expression that holds an event: the event
 * parameter of a listener, or a `const` that holds it.
 */
function eventsOfExpression(node: Node, depth = 0): string[] | undefined {
  const inner = unwrap(node);

  if (inner.kind() !== 'identifier' || depth > 3) {
    return undefined;
  }

  const value = constValue(inner);

  if (value) {
    return eventsOfExpression(value, depth + 1);
  }

  const declaration = declarationNodeOf(inner);
  const fn = declaration ? listenerOfParameter(declaration) : undefined;

  return fn ? listenerEvents(fn, declaration) : undefined;
}

/**
 * Returns the 5.x events of a pattern of an event: the pattern of the event
 * parameter, or the pattern of a `const` whose value holds the event.
 */
function eventsOfPattern(pattern: Node): string[] | undefined {
  const source = patternSource(pattern);

  if (source.id() !== pattern.id()) {
    return eventsOfExpression(source);
  }

  const fn = listenerOfParameter(pattern);

  return fn ? listenerEvents(fn, pattern) : undefined;
}

/**
 * Returns the 5.x events of an expression that holds the detail of an
 * event: `evt.detail`, `detail` destructured from an event, a value typed
 * with a detail type, or a `const` that holds one of these.
 */
function eventsOfDetail(node: Node, depth = 0): string[] | undefined {
  const inner = unwrap(node);

  if (depth > 3) {
    return undefined;
  }

  if (
    inner.kind() === 'member_expression' &&
    inner.field('property')?.text() === 'detail'
  ) {
    return eventsOfExpression(inner.field('object'));
  }

  if (inner.kind() !== 'identifier') {
    return undefined;
  }

  const declaration = declarationNodeOf(inner);
  const typed = EVENT_OF_TYPE[annotatedEventType(declaration) ?? ''];

  if (typed) {
    return [typed];
  }

  const value = constValue(inner);

  if (value) {
    return eventsOfDetail(value, depth + 1);
  }

  const entry =
    declaration?.kind() === 'shorthand_property_identifier_pattern'
      ? declaration
      : declaration?.parent()?.kind() === 'pair_pattern'
        ? declaration.parent()
        : undefined;
  const key =
    entry?.kind() === 'pair_pattern'
      ? staticKeyName(entry.field('key'))
      : entry?.text();
  const pattern = entry?.parent();

  return key === 'detail' && pattern?.kind() === 'object_pattern'
    ? eventsOfPattern(pattern)
    : undefined;
}

/**
 * Returns the 5.x events of the source of an object pattern of a detail:
 * `const { imageIdIndex } = evt.detail`, or `{ detail: { imageIdIndex } }`
 * of an event.
 */
function eventsOfDetailPattern(pattern: Node): string[] | undefined {
  const source = patternSource(pattern);

  if (source.id() !== pattern.id()) {
    return eventsOfDetail(source);
  }

  const pair = pattern.parent();
  const outer = pair?.parent();

  return pair?.kind() === 'pair_pattern' &&
    pair.field('value')?.id() === pattern.id() &&
    staticKeyName(pair.field('key')) === 'detail' &&
    outer?.kind() === 'object_pattern'
    ? eventsOfPattern(outer)
    : undefined;
}

/**
 * Returns the 6.0 key of a key of a detail for these events: every event
 * becomes one and the same 6.0 event, one of them has the key, and none
 * gives it another name. Undefined otherwise.
 */
function newDetailKey(
  key: string,
  events: string[] | undefined
): string | undefined {
  if (!events?.length || !events.every((event) => DETAIL_KEYS[event])) {
    return undefined;
  }

  if (new Set(events.map((event) => RENAMED_EVENTS[event].name)).size !== 1) {
    return undefined;
  }

  const newKeys = new Set(
    events.map((event) => DETAIL_KEYS[event][key]).filter(Boolean)
  );

  return newKeys.size === 1 ? [...newKeys][0] : undefined;
}

/**
 * Rewrites the key of an entry of an object pattern of a detail to its 6.0
 * key. A shorthand takes the new name with its uses when the name is free
 * and each use is a plain name, and keeps its local name otherwise, also
 * with a default value; a key with a name, quoted or in brackets, keeps its
 * quotes.
 */
function renameDetailEntry(
  run: Run,
  entry: Node,
  key: string,
  newKey: string
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
      run.edits.add(entry.replace(`${newKey}: ${key}`));
    }

    return;
  }

  if (kind === 'object_assignment_pattern') {
    run.edits.add(entry.field('left').replace(`${newKey}: ${key}`));

    return;
  }

  run.edits.add(renameKey(entry.field('key'), newKey));
}

/**
 * Writes the 6.0 key for a key of the detail of a 5.x listener that listens
 * to the 6.0 event after this step: `sliceIndex` for the index of a
 * `STACK_NEW_IMAGE` (`imageIdIndex`) or `VOLUME_NEW_IMAGE` (`imageIndex`)
 * listener, `delta` for `direction` of `STACK_SCROLL_OUT_OF_BOUNDS` and
 * `imageId` for `currentImageId` of `VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS`:
 * in a member access, quoted in brackets, and in a destructuring pattern
 * with or without a default.
 */
function rewriteDetailKeys(run: Run): void {
  const keys = OLD_DETAIL_KEYS.join('|');

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

    const newKey = keyNode
      ? newDetailKey(key, eventsOfDetail(node.field('object')))
      : undefined;

    if (newKey) {
      const quote = isBracket ? keyNode.text()[0] : '';

      run.edits.add(keyNode.replace(`${quote}${newKey}${quote}`));
    }
  }

  for (const pattern of run.rootNode.findAll({
    rule: { kind: 'object_pattern' },
  })) {
    for (const entry of pattern.children()) {
      const kind = entry.kind();
      const keyNode =
        kind === 'shorthand_property_identifier_pattern'
          ? entry
          : kind === 'object_assignment_pattern'
            ? entry.field('left')
            : kind === 'pair_pattern'
              ? entry.field('key')
              : undefined;
      const key = staticKeyName(keyNode);
      const newKey =
        key && OLD_DETAIL_KEYS.includes(key)
          ? newDetailKey(key, eventsOfDetailPattern(pattern))
          : undefined;

      if (newKey) {
        renameDetailEntry(run, entry, key, newKey);
      }
    }
  }
}

/**
 * Reports a string that names a removed event: a listener of it compiles and
 * never runs. A string that is a key of `Enums.Events`, which the passes
 * before rewrote or reported, is not reported again.
 */
function reportEventStrings(run: Run): void {
  const strings = run.rootNode.findAll({
    rule: {
      kind: 'string',
      regex: `^['"](${Object.keys(EVENT_STRINGS).join('|')})['"]$`,
    },
  });

  for (const node of strings) {
    if (!run.handled.has(node.range().start.index)) {
      manual.increment(site(run.root, `'${node.text().slice(1, -1)}'`, node));
    }
  }
}

/**
 * Rewrites the events that Cornerstone3D 6.0 removes and that have one event
 * in their place: `STACK_NEW_IMAGE` and `VOLUME_NEW_IMAGE` become
 * `NEW_IMAGE`, with `sliceIndex` for the key of their detail in a listener
 * the file shows, `VIEWPORT_NEW_IMAGE_SET` and `VOLUME_VIEWPORT_NEW_VOLUME`
 * become `DISPLAY_SETS_CHANGED`, `IMAGE_LOAD_ERROR` becomes
 * `IMAGE_LOAD_FAILED`, and `STACK_SCROLL_OUT_OF_BOUNDS` and
 * `VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS` become `SCROLL_OUT_OF_BOUNDS`, with
 * `delta` and `imageId` for the keys of their detail that have one, with
 * their event types. Each rewrite is reported for review. The events without
 * a twin are reported, the per-scroll events with what to listen to instead.
 */
const codemod: Codemod<TSX> = (root) => {
  const rootNode = root.root();
  const run: Run = {
    root,
    rootNode,
    edits: new EditSet(),
    handled: new Set(),
  };

  rewriteDetailKeys(run);
  rewriteMembers(run);
  rewriteDestructured(run);
  rewriteEventTypes(run);
  reportEventStrings(run);

  if (!run.edits.all().length) {
    return null;
  }

  return rootNode.commitEdits(run.edits.all());
};

export default analysed(codemod, manual, review);
