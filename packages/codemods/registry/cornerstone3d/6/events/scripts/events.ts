import type { Codemod, SgRoot } from 'codemod:ast-grep';
import type TSX from 'codemod:ast-grep/langs/tsx';
import { useMetricAtom } from 'codemod:metrics';
import {
  EditSet,
  coreImportOf,
  isCoreEnum,
  isCoreNamespace,
  isNameTaken,
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

/** The strings of the removed events, which a listener can name directly. */
const EVENT_STRINGS: Record<string, string> = {
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
 * Returns the identifiers of the file whose definition is a node.
 */
function usesOf(run: Run, definition: Node, name: string): Node[] {
  return run.rootNode
    .findAll({ rule: { kind: 'identifier', regex: `^${name}$` } })
    .filter((node) => node.definition()?.node.id() === definition.id());
}

/**
 * Rewrites the names that a file takes out of the core `Enums.Events` with a
 * destructuring pattern, and their uses.
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

    const shorthands = pattern
      .children()
      .filter(
        (child) => child.kind() === 'shorthand_property_identifier_pattern'
      );
    const keys = new Set(
      pattern
        .children()
        .map((child) =>
          child.kind() === 'pair_pattern'
            ? child.field('key')?.text()
            : child.text()
        )
    );

    for (const entry of shorthands) {
      const name = entry.text();

      if (REPORTED_EVENTS.has(name)) {
        manual.increment(site(run.root, `Events.${name}`, entry));
        continue;
      }

      if (!RENAMED_EVENTS[name]) {
        continue;
      }

      const { name: newName, note } = RENAMED_EVENTS[name];
      const uses = usesOf(run, entry, name);

      if (keys.has(newName)) {
        run.edits.add(removeProperty(entry));
      } else if (isNameTaken(run.rootNode, newName)) {
        run.edits.add(entry.replace(`${newName}: ${name}`));
        review.increment(site(run.root, `Events.${name}: ${note}`, entry));
        continue;
      } else {
        run.edits.add(entry.replace(newName));
        keys.add(newName);
      }

      for (const use of uses) {
        run.edits.add(use.replace(newName));
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
