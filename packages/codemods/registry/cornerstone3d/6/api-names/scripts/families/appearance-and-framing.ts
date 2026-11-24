import {
  CORE_PACKAGE,
  declarationNodeOf,
  isStableBinding,
  staticKeyName,
  topLevelCoreTypes,
  unwrap,
  writtenValues,
} from '../lib.ts';
import type { Node } from '../lib.ts';
import {
  mergeRules,
  noteRewritten,
  pathOf,
  receiverEvidence,
  report,
} from '../rules.ts';
import type { ExportRule, KeyRule, MemberRule, Rules, Run } from '../rules.ts';
import { importsCornerstone, reportMembersOfTypes } from './display-sets.ts';
import type { TypeMembers } from './display-sets.ts';
import { reportSubpathNames, rewriteModulePaths } from './generic-names.ts';
import type { MovedModules, SubpathNames } from './generic-names.ts';

const TOOLS_PACKAGE = '@cornerstonejs/tools';

/** The methods of the look of a display set and their names in 6.0. */
const APPEARANCE_METHODS: Record<string, string> = {
  setDisplaySetPresentation: 'setDisplaySetAppearance',
  getDisplaySetPresentation: 'getDisplaySetAppearance',
  resetDisplaySetPresentation: 'resetDisplaySetAppearance',
};

/** The text of a mount option `presentation`, word for word in the guide. */
const MOUNT_PRESENTATION =
  'Cornerstone has no mount option presentation and never read it: set the look after the mount with viewport.setDisplaySetAppearance(displaySetId, appearance)';

/** The most entries of one `setDisplaySets` call that the step reads. */
const MOUNT_ENTRIES = 8;

/** The core types of a viewport, of 6.0 and of 6.0.0-beta.2. */
const VIEWPORT_TYPES = new Set([
  'IViewport',
  'IGenericViewport',
  'BaseViewport',
  'GenericViewport',
  'PlanarViewport',
  'VolumeViewport3D',
  'VideoViewport',
  'WSIViewport',
  'ECGViewport',
]);

/**
 * Appearance: the look of a display set, `DisplaySetAppearance` in place of
 * the presentation (`setDisplaySetAppearance`, `getDisplaySetAppearance`,
 * `resetDisplaySetAppearance`, `getEffectiveDisplaySetAppearance`) and one
 * `opacity` in place of `colormap.opacity` (lanes N3, AP1, AP2).
 */
const appearance: Rules = {
  exports: [
    {
      namespace: 'utilities',
      name: 'viewportSupportsDisplaySetPresentation',
      to: 'viewportSupportsDisplaySetAppearance',
    },
  ],
  members: Object.entries(APPEARANCE_METHODS).map(
    ([name, to]): MemberRule => ({
      receiver: 'viewport',
      name,
      to,
      manual: `its name in 6.0 is ${to}`,
    })
  ),
  keys: [
    {
      in: { receiver: 'viewport', method: 'addDisplaySet', argument: 1 },
      key: 'presentation',
      manual: MOUNT_PRESENTATION,
    },
    ...Array.from(
      { length: MOUNT_ENTRIES },
      (_, argument): KeyRule => ({
        in: { receiver: 'viewport', method: 'setDisplaySets', argument },
        key: 'options.presentation',
        manual: MOUNT_PRESENTATION,
      })
    ),
  ],
};

/** The members of the look on a viewport type, for a type of the application. */
const APPEARANCE_TYPE_MEMBERS: TypeMembers = Object.fromEntries(
  Object.entries(APPEARANCE_METHODS).map(([name, to]) => [
    name,
    { types: VIEWPORT_TYPES, text: `its name in 6.0 is ${to}` },
  ])
);

/** The names of the look that a subpath of the core exports. */
const APPEARANCE_SUBPATH_NAMES: SubpathNames = {
  [`${CORE_PACKAGE}/utilities`]: {
    viewportSupportsDisplaySetPresentation:
      'use utilities.viewportSupportsDisplaySetAppearance',
  },
};

/** The types of the framing that the top of the core exports. */
const FRAMING_TYPES: Record<string, string> = {
  ProjectionPresentation: 'ProjectionFraming',
  ProjectionPresentationForKind: 'ProjectionFramingForKind',
  ProjectionPresentationForViewport: 'ProjectionFramingForViewport',
  ProjectionPresentationForViewportType: 'ProjectionFramingForViewportType',
  PlanarProjectionPresentation: 'PlanarProjectionFraming',
  Volume3DProjectionPresentation: 'Volume3DProjectionFraming',
  VideoProjectionPresentation: 'VideoProjectionFraming',
  ECGProjectionPresentation: 'ECGProjectionFraming',
  WSIProjectionPresentation: 'WSIProjectionFraming',
  PlanarViewPresentation: 'PlanarViewFraming',
  PlanarViewPresentationSelector: 'PlanarViewFramingSelector',
};

/** The types of `Types` of the framing. */
const FRAMING_NAMESPACE_TYPES: Record<string, string> = {
  ViewPresentation: 'ViewFraming',
  ViewPresentationSelector: 'ViewFramingSelector',
};

/** The methods of `viewportProjection` and of an adapter of it. */
const PROJECTION_METHODS: Record<string, string> = {
  getPresentation: 'getFraming',
  withPresentation: 'withFraming',
};

/** The projection namespaces of the families, each with an `adapter`. */
const PROJECTION_NAMESPACES = [
  'planarProjection',
  'volume3DProjection',
  'videoProjection',
  'ecgProjection',
  'wsiProjection',
];

/** The functions of the core that give a projection snapshot. */
const SNAPSHOT_CALLS = new Set([
  'viewportProjection.get',
  ...PROJECTION_NAMESPACES.map((namespace) => `${namespace}.getSnapshot`),
]);

/** The core types of a projection snapshot, whose `presentation` is `framing`. */
const SNAPSHOT_TYPES = [
  'ProjectionSnapshot',
  'ProjectionSnapshotForKind',
  'ProjectionSnapshotForViewport',
  'ProjectionSnapshotForViewportType',
  'PlanarProjectionSnapshot',
  'Volume3DProjectionSnapshot',
  'VideoProjectionSnapshot',
  'ECGProjectionSnapshot',
  'WSIProjectionSnapshot',
];

/**
 * Framing: the camera part, `ViewFraming` (`getViewFraming`,
 * `setViewFraming`, `viewportProjection.getFraming`, `withFraming`), and
 * `displayArea` only in the view state (lanes N3, VS1). AP and VS1 run in
 * parallel: each keeps to its own table and its own function.
 */
const framing: Rules = {
  exports: [
    ...Object.entries(FRAMING_TYPES).map(
      ([name, to]): ExportRule => ({ name, to })
    ),
    ...Object.entries(FRAMING_NAMESPACE_TYPES).map(
      ([name, to]): ExportRule => ({ namespace: 'Types', name, to })
    ),
    ...Object.entries(PROJECTION_METHODS).flatMap(
      ([name, to]): ExportRule[] => [
        { namespace: 'viewportProjection', name, to },
        ...PROJECTION_NAMESPACES.map(
          (namespace): ExportRule => ({
            namespace: `${namespace}.adapter`,
            name,
            to,
          })
        ),
      ]
    ),
    {
      namespace: 'planarProjection',
      name: 'derivePresentation',
      to: 'deriveFraming',
    },
    {
      package: TOOLS_PACKAGE,
      namespace: 'synchronizers',
      name: 'createPresentationViewSynchronizer',
      to: 'createViewFramingSynchronizer',
    },
  ],
  members: [
    ...SNAPSHOT_TYPES.map(
      (type): MemberRule => ({
        receiver: { type },
        name: 'presentation',
        to: 'framing',
      })
    ),
    {
      receiver: { type: 'PlanarResolvedICamera' },
      name: 'presentationScale',
      to: 'framingScale',
    },
  ],
  keys: [
    {
      in: { call: 'utilities.loadImageToCanvas', argument: 0 },
      key: 'viewPresentation',
      to: 'viewFraming',
    },
    ...['LoadImageOptions', 'FullImageLoadOptions'].map(
      (type): KeyRule => ({
        in: { type },
        key: 'viewPresentation',
        to: 'viewFraming',
      })
    ),
    ...Object.entries(PROJECTION_METHODS).flatMap(([key, to]): KeyRule[] => [
      { in: { call: 'viewportProjection.register', argument: 0 }, key, to },
      { in: { type: 'ViewportProjectionAdapter' }, key, to },
    ]),
  ],
};

/** The modules of the framing that 6.0 renamed. */
const FRAMING_MODULES: MovedModules = {
  [`${TOOLS_PACKAGE}/utilities/viewportPresentation`]: {
    to: `${TOOLS_PACKAGE}/utilities/viewportFraming`,
    names: {
      getViewportPresentation: 'getViewportFraming',
      applyViewportPresentation: 'applyViewportFraming',
    },
  },
};

/** The text of a projection adapter of the application, word for word in the guide. */
const PROJECTION_ADAPTER =
  'a projection adapter of the application: its methods are getFraming and withFraming, and the presentation of each snapshot it reads or makes is framing';

/** The names of the framing that a subpath of the core exports. */
const FRAMING_SUBPATH_NAMES: SubpathNames = {
  [`${CORE_PACKAGE}/types`]: {
    ViewPresentation: 'use Types.ViewFraming',
    ViewPresentationSelector: 'use Types.ViewFramingSelector',
  },
};

export const rules: Rules = mergeRules(appearance, framing);

/** The core types of a rendering engine. */
const ENGINE_TYPES = new Set(['RenderingEngine', 'IRenderingEngine']);

/** Tells whether a type node names a core type of a set at its top. */
function hasTypeOf(typeNode: Node | null | undefined, types: Set<string>) {
  return topLevelCoreTypes(typeNode).some((type) => types.has(type));
}

/**
 * Returns the type annotation of the declaration of an identifier: of a
 * variable (also a `let` or a `var`), a parameter or a function.
 */
function annotationOf(identifier: Node): Node | undefined {
  const declaration = declarationNodeOf(identifier);
  const holder = declaration?.parent();

  if (!holder) {
    return undefined;
  }

  if (holder.kind() === 'function_declaration') {
    return holder.field('return_type') ?? undefined;
  }

  return holder.children().find((child) => child.kind() === 'type_annotation');
}

/**
 * Tells whether the types of the file show that an expression is a viewport
 * where the evidence of the tables does not: a name declared with a core
 * viewport type (a `let`, a `var` or a parameter that the file writes too),
 * `getViewport<PlanarViewport>(...)` with a core viewport type, a
 * `getViewport` of a name declared with a core engine type, the call of a
 * function of the file declared to give a core viewport type, and a `const`
 * that holds one of these.
 */
function isTypedViewport(node: Node | null | undefined, depth = 0): boolean {
  if (!node || depth > 3) {
    return false;
  }

  const inner = unwrap(node);

  if (inner.kind() === 'identifier') {
    if (hasTypeOf(annotationOf(inner), VIEWPORT_TYPES)) {
      return true;
    }

    const declaration = declarationNodeOf(inner);
    const holder = declaration?.parent();

    return (
      holder?.kind() === 'variable_declarator' &&
      holder.field('name')?.id() === declaration.id() &&
      isStableBinding(declaration) &&
      isTypedViewport(holder.field('value'), depth + 1)
    );
  }

  if (inner.kind() !== 'call_expression') {
    return false;
  }

  const callee = inner.field('function');

  if (callee?.kind() === 'identifier') {
    const declaration = declarationNodeOf(callee);
    const holder = declaration?.parent();

    return (
      holder?.kind() === 'function_declaration' &&
      hasTypeOf(holder.field('return_type'), VIEWPORT_TYPES)
    );
  }

  if (
    callee?.kind() !== 'member_expression' ||
    callee.field('property')?.text() !== 'getViewport'
  ) {
    return false;
  }

  const typeArgument = inner
    .field('type_arguments')
    ?.children()
    .find((child) => child.isNamed());
  const engine = unwrap(callee.field('object'));

  return typeArgument
    ? hasTypeOf(typeArgument, VIEWPORT_TYPES)
    : engine.kind() === 'identifier' &&
        hasTypeOf(annotationOf(engine), ENGINE_TYPES);
}

/** The type names that say nothing of a value. */
const OPAQUE_TYPES = new Set(['unknown', 'any', 'object']);

/**
 * Tells whether a type node is a type of the application: not opaque
 * (`unknown`, `any`) and with no core type at its top.
 */
function isApplicationType(typeNode: Node | null | undefined): boolean {
  return Boolean(
    typeNode &&
      !OPAQUE_TYPES.has(typeNode.text()) &&
      !topLevelCoreTypes(typeNode).length
  );
}

/**
 * Tells whether the file gives an expression a type of the application: a
 * cast to such a type (`viewport as unknown as { setDisplaySetPresentation():
 * void }`, `viewport as NativeViewport`), or a name declared with one or
 * that holds such a cast. The members of that type are the application's,
 * whatever Cornerstone value is under the cast.
 */
function hasApplicationType(node: Node | null | undefined, depth = 0): boolean {
  let current = node;

  while (current && depth <= 4) {
    const kind = current.kind();
    const named = current.children().filter((child) => child.isNamed());

    if (kind === 'parenthesized_expression' || kind === 'non_null_expression') {
      current = named[0];
    } else if (kind === 'as_expression' || kind === 'satisfies_expression') {
      if (isApplicationType(named[named.length - 1])) {
        return true;
      }

      current = named[0];
    } else if (kind === 'type_assertion') {
      const typeNode = named[0]?.children().find((child) => child.isNamed());

      if (isApplicationType(typeNode)) {
        return true;
      }

      current = named[named.length - 1];
    } else {
      break;
    }
  }

  if (current?.kind() !== 'identifier') {
    return false;
  }

  const declaration = declarationNodeOf(current);
  const holder = declaration?.parent();
  const annotation = holder
    ?.children()
    .find((child) => child.kind() === 'type_annotation');

  if (annotation) {
    return isApplicationType(
      annotation.children().find((child) => child.isNamed())
    );
  }

  return (
    holder?.kind() === 'variable_declarator' &&
    holder.field('name')?.id() === declaration.id() &&
    isStableBinding(declaration) &&
    hasApplicationType(holder.field('value'), depth + 1)
  );
}

/**
 * Reports a method of the look on a receiver that the file gives a type of
 * the application (`hasApplicationType`): the type declares the method, so
 * the step leaves the call and the declaration together, and the tables
 * leave the site.
 */
function reportApplicationTypedReceivers(run: Run): void {
  for (const member of run.rootNode.findAll({
    rule: {
      kind: 'member_expression',
      has: {
        field: 'property',
        regex: `^(${Object.keys(APPEARANCE_METHODS).join('|')})$`,
      },
    },
  })) {
    const property = member.field('property');
    const name = property?.text() ?? '';

    if (
      !property ||
      run.handled.has(property.range().start.index) ||
      !hasApplicationType(member.field('object'))
    ) {
      continue;
    }

    run.handled.add(property.range().start.index);
    report(
      run,
      'manual',
      `${name}: the object has a type of the application, which declares the method: rename the method there and here, its name in 6.0 is ${APPEARANCE_METHODS[name]}`,
      member
    );
  }
}

/**
 * Renames a method of the look on a receiver that only the types of the
 * file show to be a viewport (`isTypedViewport`). The tables then leave the
 * site.
 */
function rewriteTypedReceivers(run: Run): void {
  for (const member of run.rootNode.findAll({
    rule: {
      kind: 'member_expression',
      has: {
        field: 'property',
        regex: `^(${Object.keys(APPEARANCE_METHODS).join('|')})$`,
      },
    },
  })) {
    const property = member.field('property');
    const object = member.field('object');
    const name = property?.text() ?? '';

    if (
      !property ||
      run.handled.has(property.range().start.index) ||
      receiverEvidence(object, 'viewport') === 'proven' ||
      !isTypedViewport(object)
    ) {
      continue;
    }

    run.handled.add(property.range().start.index);

    if (!run.edits.add(property.replace(APPEARANCE_METHODS[name]))) {
      report(
        run,
        'manual',
        `${name}: another rewrite of the line overlaps it, its name in 6.0 is ${APPEARANCE_METHODS[name]}`,
        member
      );
      continue;
    }

    noteRewritten(run, `${name} -> ${APPEARANCE_METHODS[name]}`, member);
  }
}

/**
 * Renames or reports a string that names a method of the look, in a file
 * that imports Cornerstone: the key of an indexed type of a core viewport
 * type (`PlanarViewport['getDisplaySetPresentation']`) is renamed; another
 * string, such as the name given to `jest.spyOn`, is reported. A string in
 * brackets or in an `in` test is the tables' to rename.
 */
function rewriteMethodStrings(run: Run): void {
  if (!importsCornerstone(run)) {
    return;
  }

  for (const string of run.rootNode.findAll({ rule: { kind: 'string' } })) {
    const name = string.text().slice(1, -1);
    const parent = string.parent();
    const kind = parent?.kind() ?? '';

    if (
      !Object.prototype.hasOwnProperty.call(APPEARANCE_METHODS, name) ||
      run.handled.has(string.range().start.index) ||
      kind === 'subscript_expression' ||
      kind === 'import_statement' ||
      kind === 'export_statement' ||
      (kind === 'binary_expression' &&
        parent.field('left')?.id() === string.id())
    ) {
      continue;
    }

    const to = APPEARANCE_METHODS[name];
    const lookup = kind === 'literal_type' ? parent.parent() : undefined;
    const objectType =
      lookup?.kind() === 'lookup_type'
        ? lookup.children().find((child) => child.isNamed())
        : undefined;

    run.handled.add(string.range().start.index);

    if (objectType && hasTypeOf(objectType, VIEWPORT_TYPES)) {
      const quote = string.text()[0];

      if (run.edits.add(string.replace(`${quote}${to}${quote}`))) {
        noteRewritten(run, `${name} -> ${to}`, string);
        continue;
      }
    }

    report(
      run,
      'manual',
      `${name}: a string that names a method of the look, on a viewport its name in 6.0 is ${to}`,
      string
    );
  }
}

/**
 * Reports a method of the look on an object that the file does not show to
 * be a viewport, in a file that imports Cornerstone: the tables leave it,
 * and the names are Cornerstone's.
 */
function reportUnprovenReceivers(run: Run): void {
  if (!importsCornerstone(run)) {
    return;
  }

  for (const member of run.rootNode.findAll({
    rule: {
      kind: 'member_expression',
      has: {
        field: 'property',
        regex: `^(${Object.keys(APPEARANCE_METHODS).join('|')})$`,
      },
    },
  })) {
    const property = member.field('property');
    const name = property?.text() ?? '';

    if (
      !property ||
      run.handled.has(property.range().start.index) ||
      receiverEvidence(member.field('object'), 'viewport')
    ) {
      continue;
    }

    run.handled.add(property.range().start.index);
    report(
      run,
      'manual',
      `${name}: the file does not show that the object is a viewport, on a viewport its name in 6.0 is ${APPEARANCE_METHODS[name]}`,
      member
    );
  }
}

/**
 * The rewrites of the appearance that no table entry says: a method of the
 * look on a receiver that only the types of the file show to be a viewport,
 * and its name in an indexed type of a viewport type, are renamed; a member
 * of the look that a type of the application declares on top of a viewport
 * type, a name of the look imported from a subpath of the core, a method of
 * the look on a receiver of a type of the application, another string that
 * names a method of the look, and a method of the look on an object that the
 * file does not show to be a viewport, are reported.
 */
function rewriteAppearance(run: Run): void {
  reportMembersOfTypes(run, APPEARANCE_TYPE_MEMBERS);
  reportSubpathNames(run, new Set(), APPEARANCE_SUBPATH_NAMES);
  reportApplicationTypedReceivers(run);
  rewriteTypedReceivers(run);
  rewriteMethodStrings(run);
  reportUnprovenReceivers(run);
}

/**
 * Returns the values that the binding of an identifier gets: the value of a
 * `const`, or each value that the file gives a `let` or a `var`. Undefined
 * for another binding, or a name written in another way.
 */
function boundValues(identifier: Node): Node[] | undefined {
  const declaration = declarationNodeOf(identifier);
  const holder = declaration?.parent();

  if (
    !declaration ||
    holder?.kind() !== 'variable_declarator' ||
    holder.field('name')?.id() !== declaration.id()
  ) {
    return undefined;
  }

  if (isStableBinding(declaration)) {
    const value = holder.field('value');

    return value ? [value] : undefined;
  }

  return writtenValues(declaration);
}

/**
 * Tells whether an expression is the snapshot that `viewportProjection.get`
 * or the `getSnapshot` of a projection namespace gives: the call, or a name
 * whose every value is one.
 */
function isProjectionSnapshot(
  node: Node | null | undefined,
  depth = 0
): boolean {
  if (!node || depth > 3) {
    return false;
  }

  const inner = unwrap(node);

  if (inner.kind() === 'call_expression') {
    return SNAPSHOT_CALLS.has(pathOf(inner.field('function')) ?? '');
  }

  const values = inner.kind() === 'identifier' ? boundValues(inner) : undefined;

  return Boolean(
    values?.length &&
      values.every((value) => isProjectionSnapshot(value, depth + 1))
  );
}

/**
 * Reports each projection adapter of the application, once: an argument of
 * `viewportProjection.register` and a name typed `ViewportProjectionAdapter`.
 * The tables rename its keys; the snapshots that its functions read and make
 * are the application's to rename.
 */
function reportProjectionAdapters(run: Run): void {
  for (const node of run.rootNode.findAll({
    rule: {
      any: [{ kind: 'call_expression' }, { kind: 'variable_declarator' }],
    },
  })) {
    const isAdapter =
      node.kind() === 'call_expression'
        ? pathOf(node.field('function')) === 'viewportProjection.register'
        : topLevelCoreTypes(
            node.children().find((child) => child.kind() === 'type_annotation')
          ).includes('ViewportProjectionAdapter');

    if (isAdapter) {
      report(run, 'manual', PROJECTION_ADAPTER, node);
    }
  }
}

/**
 * Renames `presentation` to `framing` on the snapshot of
 * `viewportProjection.get` and of the `getSnapshot` of a projection
 * namespace: a member read and a destructured key, which
 * keeps its local name (`{ presentation }` becomes `{ framing: presentation }`).
 */
function rewriteSnapshotFraming(run: Run): void {
  const rename = (site: Node, keyNode: Node, text: string) => {
    run.handled.add(keyNode.range().start.index);

    if (!run.edits.add(keyNode.replace(text))) {
      report(
        run,
        'manual',
        'presentation: another rewrite of the line overlaps it, its name in 6.0 is framing',
        site
      );

      return;
    }

    noteRewritten(run, 'presentation -> framing', site);
  };

  for (const member of run.rootNode.findAll({
    rule: {
      kind: 'member_expression',
      has: { field: 'property', regex: '^presentation$' },
    },
  })) {
    const property = member.field('property');

    if (
      property &&
      !run.handled.has(property.range().start.index) &&
      isProjectionSnapshot(member.field('object'))
    ) {
      rename(member, property, 'framing');
    }
  }

  for (const pattern of run.rootNode.findAll({
    rule: { kind: 'object_pattern' },
  })) {
    const holder = pattern.parent();

    if (
      holder?.kind() !== 'variable_declarator' ||
      holder.field('name')?.id() !== pattern.id() ||
      !isProjectionSnapshot(holder.field('value'))
    ) {
      continue;
    }

    for (const entry of pattern.children()) {
      const keyNode =
        entry.kind() === 'shorthand_property_identifier_pattern'
          ? entry
          : entry.kind() === 'pair_pattern'
            ? entry.field('key')
            : entry.kind() === 'object_assignment_pattern'
              ? entry.field('left')
              : undefined;

      if (
        !keyNode ||
        staticKeyName(keyNode) !== 'presentation' ||
        run.handled.has(keyNode.range().start.index)
      ) {
        continue;
      }

      rename(
        entry,
        keyNode,
        keyNode.kind() === 'shorthand_property_identifier_pattern'
          ? 'framing: presentation'
          : 'framing'
      );
    }
  }
}

/**
 * The rewrites of the framing that no table entry says: the module of the
 * framing of the tools and the `presentation` of a projection snapshot. The
 * names of the framing imported from a subpath of the core and each
 * projection adapter of the application are reported.
 */
function rewriteFraming(run: Run): void {
  const taken = rewriteModulePaths(run, FRAMING_MODULES, {});

  reportSubpathNames(run, taken, FRAMING_SUBPATH_NAMES);
  rewriteSnapshotFraming(run);
  reportProjectionAdapters(run);
}

/**
 * The rewrites of this family that no table entry says. They run before the
 * tables of every family; a site they rewrite or report is marked handled
 * (`run.handled`), and the tables leave it.
 */
export function rewrite(run: Run): void {
  rewriteAppearance(run);
  rewriteFraming(run);
}
