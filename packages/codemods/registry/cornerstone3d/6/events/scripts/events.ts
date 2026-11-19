import type { Codemod, SgRoot } from 'codemod:ast-grep';
import type TSX from 'codemod:ast-grep/langs/tsx';
import { useMetricAtom } from 'codemod:metrics';
import {
  EditSet,
  bindsAt,
  coreImportOf,
  isCoreEnum,
  isCoreNamespace,
  isNameTaken,
  referencesOf,
  removeProperty,
  site,
} from './lib.ts';
import type { Node } from './lib.ts';

/** Sites that the reader changes. */
const manual = useMetricAtom('cornerstone3d-6-manual');

/** Rewrites at a decision of the migration guide. */
const review = useMetricAtom('cornerstone3d-6-review');

/** The removed events that have one event in their place, and why to review. */
const RENAMED_EVENTS: Record<string, { name: string; note: string }> = {
  STACK_NEW_IMAGE: {
    name: 'NEW_IMAGE',
    note: 'NEW_IMAGE also fires for each slice of a volume',
  },
  VOLUME_NEW_IMAGE: {
    name: 'NEW_IMAGE',
    note: 'detail.imageIndex is detail.imageIdIndex',
  },
  IMAGE_LOAD_ERROR: {
    name: 'IMAGE_LOAD_FAILED',
    note: 'the detail has no imageIdIndex, a failed prefetch fires it too',
  },
};

/** The removed events that need the application. */
const REPORTED_EVENTS = new Set([
  'PRE_STACK_NEW_IMAGE',
  'STACK_VIEWPORT_SCROLL',
  'PRESET_MODIFIED',
  'ACTORS_CHANGED',
  'CLIPPING_PLANES_UPDATED',
  'DYNAMIC_VOLUME_TIME_POINT_INDEX_CHANGED',
  'DYNAMIC_VOLUME_TIME_POINT_LOADED',
]);

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
  CORNERSTONE_PRE_STACK_NEW_IMAGE: 'PRE_STACK_NEW_IMAGE',
  CORNERSTONE_STACK_VIEWPORT_SCROLL: 'STACK_VIEWPORT_SCROLL',
  CORNERSTONE_VIEWPORT_RENDERING_PRESET_MODIFIED: 'PRESET_MODIFIED',
  CORNERSTONE_ACTORS_CHANGED: 'ACTORS_CHANGED',
  CORNERSTONE_CLIPPING_PLANES_UPDATED: 'CLIPPING_PLANES_UPDATED',
};

/** The event types of `Types.EventTypes` that 6.0 renames. */
const RENAMED_EVENT_TYPES: Record<string, string> = {
  StackNewImageEvent: 'NewImageEvent',
  StackNewImageEventDetail: 'NewImageEventDetail',
  VolumeNewImageEvent: 'NewImageEvent',
  VolumeNewImageEventDetail: 'NewImageEventDetail',
};

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
}

/**
 * Rewrites `Events.STACK_NEW_IMAGE` and its kin, read as a member of the core
 * `Enums.Events`.
 */
function rewriteMembers(run: Run): void {
  const names = [...Object.keys(RENAMED_EVENTS), ...REPORTED_EVENTS].join('|');
  const members = run.rootNode.findAll({
    rule: {
      kind: 'member_expression',
      has: { field: 'property', regex: `^(${names})$` },
    },
  });

  for (const node of members) {
    const name = node.field('property').text();

    if (!isCoreEnum(node.field('object'), 'Events')) {
      continue;
    }

    if (REPORTED_EVENTS.has(name)) {
      manual.increment(site(run.root, `Events.${name}`, node));
      continue;
    }

    const { name: newName, note } = RENAMED_EVENTS[name];

    if (run.edits.add(node.field('property').replace(newName))) {
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
 * Returns the local names of a destructuring pattern by key.
 */
function patternLocals(pattern: Node): Map<string, PatternLocal> {
  const locals = new Map<string, PatternLocal>();

  for (const child of pattern.children()) {
    if (child.kind() === 'shorthand_property_identifier_pattern') {
      locals.set(child.text(), {
        node: child,
        name: child.text(),
        renamed: false,
      });
    } else if (child.kind() === 'pair_pattern') {
      const key = child.field('key');
      const value = child.field('value');
      const name =
        key?.kind() === 'string' ? key.text().slice(1, -1) : key?.text();

      if (name && value?.kind() === 'identifier') {
        locals.set(name, { node: value, name: value.text(), renamed: false });
      }
    }
  }

  return locals;
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
 * Rewrites the names that a file takes out of the core `Enums.Events` with a
 * destructuring pattern, and their uses. An entry with a local name keeps
 * it, and only its key changes.
 */
function rewriteDestructured(run: Run): void {
  const patterns = run.rootNode.findAll({ rule: { kind: 'object_pattern' } });

  for (const pattern of patterns) {
    const declarator = pattern.parent();
    const value =
      declarator?.kind() === 'variable_declarator'
        ? declarator.field('value')
        : undefined;

    if (!value || !isCoreEnum(value, 'Events')) {
      continue;
    }

    const locals = patternLocals(pattern);

    for (const entry of pattern.children()) {
      const isShorthand =
        entry.kind() === 'shorthand_property_identifier_pattern';
      const keyNode = isShorthand
        ? entry
        : entry.kind() === 'pair_pattern'
          ? entry.field('key')
          : undefined;
      const name = keyNode?.text() ?? '';

      if (REPORTED_EVENTS.has(name)) {
        manual.increment(site(run.root, `Events.${name}`, entry));
        continue;
      }

      if (!RENAMED_EVENTS[name]) {
        continue;
      }

      const { name: newName, note } = RENAMED_EVENTS[name];

      if (isShorthand) {
        rewriteShorthand(run, entry, newName, locals);
      } else {
        run.edits.add(keyNode.replace(newName));
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
 * Reports a string that names a removed event: a listener of it compiles and
 * never runs.
 */
function reportEventStrings(run: Run): void {
  const strings = run.rootNode.findAll({
    rule: {
      kind: 'string',
      regex: `^['"](${Object.keys(EVENT_STRINGS).join('|')})['"]$`,
    },
  });

  for (const node of strings) {
    manual.increment(site(run.root, `'${node.text().slice(1, -1)}'`, node));
  }
}

/**
 * Rewrites the events that Cornerstone3D 6.0 removes and that have one event
 * in their place: `STACK_NEW_IMAGE` and `VOLUME_NEW_IMAGE` become
 * `NEW_IMAGE`, `IMAGE_LOAD_ERROR` becomes `IMAGE_LOAD_FAILED`, with their
 * event types. Each rewrite is reported for review. The events without a
 * twin are reported.
 */
const codemod: Codemod<TSX> = (root) => {
  const rootNode = root.root();
  const run: Run = { root, rootNode, edits: new EditSet() };

  rewriteMembers(run);
  rewriteDestructured(run);
  rewriteEventTypes(run);
  reportEventStrings(run);

  if (!run.edits.all().length) {
    return null;
  }

  return rootNode.commitEdits(run.edits.all());
};

export default codemod;
