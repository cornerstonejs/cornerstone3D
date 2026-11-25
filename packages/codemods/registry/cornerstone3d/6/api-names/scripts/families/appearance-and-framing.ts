import {
  CORE_PACKAGE,
  declarationNodeOf,
  hasApplicationType,
  isStableBinding,
  referencesOf,
  methodCall,
  staticKeyName,
  topLevelCoreTypes,
  unwrap,
  writtenValues,
} from '../lib.ts';
import type { Node } from '../lib.ts';
import {
  entryOf,
  mergeRules,
  noteRewritten,
  pathOf,
  placeObjects,
  receiverEvidence,
  report,
} from '../rules.ts';
import type {
  ExportRule,
  KeyPlace,
  KeyRule,
  MemberRule,
  Rules,
  Run,
} from '../rules.ts';
import {
  COLORMAP_OPACITY,
  rewriteColormapOpacity,
} from './appearance-colormap.ts';
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

/** The events that `DISPLAY_SET_APPEARANCE_CHANGED` replaces, with their values. */
const APPEARANCE_EVENTS: Record<string, string> = {
  VOI_MODIFIED: 'CORNERSTONE_VOI_MODIFIED',
  COLORMAP_MODIFIED: 'CORNERSTONE_COLORMAP_MODIFIED',
};

/** The text of a listener of the appearance event, word for word in the guide. */
const APPEARANCE_EVENT_REVIEW =
  'DISPLAY_SET_APPEARANCE_CHANGED fires once for every change of the appearance of a display set, also at its mount and when a scroll shows an image with another default window: test detail.cause and detail.changedKeys; the window is detail.effective.voiRange, the colormap detail.effective.colormap, what a caller set detail.overrides';

/** The types of the detail of the two events and their names in 6.0. */
const APPEARANCE_EVENT_TYPES: Record<string, string> = {
  VoiModifiedEvent: 'DisplaySetAppearanceChangedEvent',
  VoiModifiedEventDetail: 'DisplaySetAppearanceChangedEventDetail',
  ColormapModifiedEvent: 'DisplaySetAppearanceChangedEvent',
  ColormapModifiedEventDetail: 'DisplaySetAppearanceChangedEventDetail',
};

/**
 * The keys of the detail of `VOI_MODIFIED` and `COLORMAP_MODIFIED` and their
 * place in the detail of `DISPLAY_SET_APPEARANCE_CHANGED`; null for a key
 * that has none.
 */
const DETAIL_KEYS: Record<string, string | null> = {
  viewportId: 'viewportId',
  volumeId: 'volumeId',
  range: 'effective.voiRange',
  VOILUTFunction: 'effective.voiLUTFunction',
  invert: 'effective.invert',
  colormap: 'effective.colormap',
  invertStateChanged: null,
};

/** The text of a read of the overrides that shows or compares them. */
const SHOWN_OVERRIDES =
  'it gives the overrides only, what a caller set, and here the value is shown or compared: use getEffectiveDisplaySetAppearance for what is drawn, the defaults included';

/**
 * The text of a mount option `presentation`, word for word in the guide. No
 * released Cornerstone read such a key, so the step reports it and moves
 * nothing: a rename to `appearance` would draw a look the application never
 * had.
 */
const MOUNT_PRESENTATION =
  'the key did nothing, Cornerstone never read a mount option presentation: an appearance from the first draw is the mount option appearance (options.appearance), and a value moved there changes what the viewport shows';

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
    ...Object.entries(APPEARANCE_EVENTS).map(
      ([name, value]): ExportRule => ({
        namespace: 'Enums.Events',
        name,
        to: 'DISPLAY_SET_APPEARANCE_CHANGED',
        review: APPEARANCE_EVENT_REVIEW,
        value,
      })
    ),
    ...Object.entries(APPEARANCE_EVENT_TYPES).map(
      ([name, to]): ExportRule => ({
        namespace: 'Types.EventTypes',
        name,
        to,
        review: APPEARANCE_EVENT_REVIEW,
      })
    ),
    {
      namespace: 'Types',
      name: 'ColormapPublic',
      to: 'AppearanceColormap',
      manual: COLORMAP_OPACITY,
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
  [`${CORE_PACKAGE}/types`]: {
    ColormapPublic: 'use Types.AppearanceColormap',
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

/** The texts of the display area of a viewport, word for word in the guide. */
const DISPLAY_AREA_TEXTS = {
  setDisplayArea:
    'use viewport.setViewState({ displayArea }): it shows the area at scale [1, 1], and CAMERA_MODIFIED fires in place of DISPLAY_AREA_MODIFIED',
  getDisplayArea: 'use viewport.getViewState().displayArea',
  setOptions:
    'a viewport has no setOptions: set a display area with viewport.setViewState({ displayArea }); the other options are set once, in defaultOptions at enableElement',
  reset:
    'a viewport has no reset: viewport.resetViewState() goes back to the display area of defaultOptions or of setViewState given with storeAsInitialCamera: true',
  options:
    'a viewport has no options: read viewport.defaultOptions (the options of enableElement) or viewport.getViewState().displayArea',
  event:
    'DISPLAY_AREA_MODIFIED is gone: listen to CAMERA_MODIFIED and read viewport.getViewState().displayArea',
  undefinedArea:
    'setDisplayArea did nothing with an undefined area, setViewState({ displayArea: undefined }) clears the display area',
  setViewState:
    'setViewState({ displayArea }) without scale, scaleMode, anchorWorld or anchorCanvas shows the area at scale [1, 1]; 6.0.0-beta.2 kept the scale of the view state',
};

/** The keys of the framing and of its selector that 6.0 deleted: nothing read them. */
const DEAD_SELECTOR_KEYS = [
  'slabThickness',
  'windowLevel',
  'paletteLut',
  'aspectRatio',
];

/**
 * The review text of an aspect ratio deleted from a framing: 6.0.0-beta.2
 * did nothing with it, 5.x `setViewPresentation` stretched the view by it.
 */
const ASPECT_RATIO_REVIEW =
  'the framing has no aspectRatio, which did nothing in 6.0.0-beta.2: the stretch that 5.x setViewPresentation gave with it is the scale pair of a planar framing, setViewFraming({ scale: [x, y] })';

/**
 * Framing: the camera part, `ViewFraming` (`getViewFraming`,
 * `setViewFraming`, `viewportProjection.getFraming`, `withFraming`), and
 * `displayArea` only in the view state (lanes N3, VS1). AP and VS1 run in
 * parallel: each keeps to its own table and its own function.
 */
const framing: Rules = {
  exports: [
    {
      namespace: 'Enums.Events',
      name: 'DISPLAY_AREA_MODIFIED',
      manual: DISPLAY_AREA_TEXTS.event,
      value: 'CORNERSTONE_DISPLAY_AREA_MODIFIED',
    },
    ...['DisplayAreaModifiedEvent', 'DisplayAreaModifiedEventDetail'].map(
      (name): ExportRule => ({
        namespace: 'Types.EventTypes',
        name,
        manual: DISPLAY_AREA_TEXTS.event,
      })
    ),
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
    ...(
      [
        'setDisplayArea',
        'getDisplayArea',
        'setOptions',
        'reset',
        'options',
      ] as const
    ).map(
      (name): MemberRule => ({
        receiver: 'viewport',
        name,
        manual: DISPLAY_AREA_TEXTS[name],
      })
    ),
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
    ...DEAD_SELECTOR_KEYS.flatMap((key): KeyRule[] => [
      {
        in: { receiver: 'viewport', method: 'getViewFraming', argument: 0 },
        key,
        remove: true,
      },
      ...['getFraming', 'getPresentation'].map(
        (method): KeyRule => ({
          in: { call: `viewportProjection.${method}`, argument: 1 },
          key: `selector.${key}`,
          remove: true,
        })
      ),
      ...['ViewFramingSelector', 'ViewPresentationSelector'].map(
        (type): KeyRule => ({ in: { type }, key, remove: true })
      ),
    ]),
    {
      in: { receiver: 'viewport', method: 'setViewFraming', argument: 0 },
      key: 'slabThickness',
      remove: true,
    },
    ...['ViewFraming', 'ViewPresentation'].map(
      (type): KeyRule => ({ in: { type }, key: 'slabThickness', remove: true })
    ),
    {
      in: { receiver: 'viewport', method: 'setViewFraming', argument: 0 },
      key: 'aspectRatio',
      remove: true,
      review: ASPECT_RATIO_REVIEW,
    },
    ...['ViewFraming', 'ViewPresentation'].map(
      (type): KeyRule => ({
        in: { type },
        key: 'aspectRatio',
        remove: true,
        review: ASPECT_RATIO_REVIEW,
      })
    ),
    {
      in: { receiver: 'viewport', method: 'setViewState', argument: 0 },
      key: 'displayArea',
      review: DISPLAY_AREA_TEXTS.setViewState,
    },
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
 * that holds one of these. A type of the application at the top
 * (`hasApplicationType`) shows none.
 */
function isTypedViewport(node: Node | null | undefined, depth = 0): boolean {
  if (!node || depth > 3 || hasApplicationType(node)) {
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

/** The function kinds of a listener. */
const FUNCTION_KINDS = new Set([
  'arrow_function',
  'function_expression',
  'function',
  'function_declaration',
]);

/**
 * Returns the function that a listener argument is: an arrow function or a
 * function expression, or a name of the file that declares a function or
 * holds one in a `const`. Undefined for another listener, such as a method.
 */
function listenerFunction(node: Node | null | undefined): Node | undefined {
  if (!node) {
    return undefined;
  }

  const inner = unwrap(node);

  if (FUNCTION_KINDS.has(inner.kind())) {
    return inner;
  }

  if (inner.kind() !== 'identifier') {
    return undefined;
  }

  const declaration = declarationNodeOf(inner);
  const holder = declaration?.parent();

  if (holder?.kind() === 'function_declaration') {
    return holder;
  }

  return holder?.kind() === 'variable_declarator' &&
    holder.field('name')?.id() === declaration.id() &&
    isStableBinding(declaration)
    ? listenerFunction(holder.field('value'))
    : undefined;
}

/**
 * Returns the node that names the first parameter of a function when it is
 * a plain name, else undefined.
 */
function firstParameterName(fn: Node): Node | undefined {
  const single = fn.field('parameter');

  if (single) {
    return single.kind() === 'identifier' ? single : undefined;
  }

  const first = fn
    .field('parameters')
    ?.children()
    .find((child) => child.isNamed());
  const pattern =
    first?.kind() === 'required_parameter' ||
    first?.kind() === 'optional_parameter'
      ? first.field('pattern')
      : first;

  return pattern?.kind() === 'identifier' ? pattern : undefined;
}

/**
 * Returns the text of a destructured entry of a key of the old detail in the
 * new detail: `range` becomes `effective: { voiRange: range }`.
 */
function movedEntryText(place: string, local: string): string {
  const [holder, key] = place.split('.');

  return `${holder}: { ${key === local ? key : `${key}: ${local}`} }`;
}

/**
 * Rewrites the entries of a pattern that destructures the detail of the old
 * events, and reports the entries that it cannot rewrite.
 */
function rewriteDetailPattern(run: Run, pattern: Node, event: string): void {
  for (const entry of pattern.children().filter((child) => child.isNamed())) {
    const kind = entry.kind();
    const keyNode =
      kind === 'shorthand_property_identifier_pattern'
        ? entry
        : kind === 'pair_pattern'
          ? entry.field('key')
          : undefined;
    const key = staticKeyName(keyNode);
    const place = key === undefined ? undefined : DETAIL_KEYS[key];

    if (!keyNode || key === undefined || place === undefined) {
      report(
        run,
        'manual',
        `${event}: a part of the detail that the step cannot follow; ${APPEARANCE_EVENT_REVIEW}`,
        entry
      );
      continue;
    }

    if (place === key) {
      continue;
    }

    if (place === null) {
      report(
        run,
        'manual',
        `${event}: the detail has no ${key}; test detail.changedKeys`,
        entry
      );
      continue;
    }

    const local =
      kind === 'pair_pattern' ? entry.field('value')?.text() : entry.text();

    if (!local || !run.edits.add(entry.replace(movedEntryText(place, local)))) {
      report(
        run,
        'manual',
        `${event}: the key ${key} of the detail is ${place}`,
        entry
      );
      continue;
    }

    noteRewritten(run, `${event}: detail ${key} -> ${place}`, entry);
  }
}

/**
 * Rewrites the reads of the detail in a listener of `VOI_MODIFIED` or
 * `COLORMAP_MODIFIED` whose event parameter is a plain name: a key of the
 * detail with a place in the new detail takes it (`detail.range` becomes
 * `detail.effective.voiRange`, also in a destructuring pattern), and every
 * other use of the detail is reported.
 */
function rewriteListenerDetail(run: Run, fn: Node, event: string): void {
  const parameter = firstParameterName(fn);

  if (!parameter) {
    report(
      run,
      'manual',
      `${event}: a listener whose event parameter is not a plain name; ${APPEARANCE_EVENT_REVIEW}`,
      fn
    );
    return;
  }

  for (const reference of referencesOf(parameter)) {
    const detail = reference.parent();

    if (
      detail?.kind() !== 'member_expression' ||
      detail.field('object')?.id() !== reference.id()
    ) {
      continue;
    }

    if (detail.field('property')?.text() !== 'detail') {
      continue;
    }

    const holder = detail.parent();

    if (
      holder?.kind() === 'member_expression' &&
      holder.field('object')?.id() === detail.id()
    ) {
      const property = holder.field('property');
      const key = property?.text() ?? '';
      const place = DETAIL_KEYS[key];

      if (place === key) {
        continue;
      }

      if (!property || !place || !run.edits.add(property.replace(place))) {
        report(
          run,
          'manual',
          place === null
            ? `${event}: the detail has no ${key}; test detail.changedKeys`
            : `${event}: a part of the detail that the step cannot follow; ${APPEARANCE_EVENT_REVIEW}`,
          holder
        );
        continue;
      }

      noteRewritten(run, `${event}: detail ${key} -> ${place}`, property);
      continue;
    }

    if (
      holder?.kind() === 'variable_declarator' &&
      holder.field('value')?.id() === detail.id() &&
      holder.field('name')?.kind() === 'object_pattern'
    ) {
      rewriteDetailPattern(run, holder.field('name'), event);
      continue;
    }

    report(
      run,
      'manual',
      `${event}: the detail goes on as a whole; ${APPEARANCE_EVENT_REVIEW}`,
      detail
    );
  }
}

/**
 * Rewrites the reads of the detail of each listener of `VOI_MODIFIED` and
 * `COLORMAP_MODIFIED` that `addEventListener` gets, once per function. A
 * listener that is not a function of the file is reported. The tables
 * rename the event itself and report it for review.
 */
function rewriteAppearanceListeners(run: Run): void {
  const done = new Set<number>();

  for (const call of run.rootNode.findAll({
    rule: {
      kind: 'call_expression',
      has: {
        field: 'function',
        kind: 'member_expression',
        has: { field: 'property', regex: '^addEventListener$' },
      },
    },
  })) {
    const args = call
      .field('arguments')
      ?.children()
      .filter((child) => child.isNamed());
    const path = pathOf(args?.[0]) ?? '';
    const event = path.replace(/^Enums\.Events\./, '');

    if (
      !path.startsWith('Enums.Events.') ||
      !Object.prototype.hasOwnProperty.call(APPEARANCE_EVENTS, event)
    ) {
      continue;
    }

    const fn = listenerFunction(args[1]);

    if (!fn) {
      report(
        run,
        'manual',
        `${event}: a listener that is not a function of this file; ${APPEARANCE_EVENT_REVIEW}`,
        args[1] ?? call
      );
      continue;
    }

    if (done.has(fn.id())) {
      continue;
    }

    done.add(fn.id());
    rewriteListenerDetail(run, fn, event);
  }
}

/** The operators that compare. */
const COMPARISONS = new Set(['===', '!==', '==', '!=', '<', '>', '<=', '>=']);

/**
 * Returns the node that shows or compares a value, or a key read off it:
 * a comparison, a `!`, a template string or a JSX expression. Undefined
 * when the value goes elsewhere.
 */
function showingNode(node: Node): Node | undefined {
  let current = node;

  for (;;) {
    const parent = current.parent();
    const kind = parent?.kind() ?? '';

    if (
      (kind === 'member_expression' &&
        parent.field('object')?.id() === current.id()) ||
      kind === 'parenthesized_expression' ||
      kind === 'non_null_expression'
    ) {
      current = parent;
      continue;
    }

    if (kind === 'binary_expression') {
      return COMPARISONS.has(parent.field('operator')?.text() ?? '')
        ? parent
        : undefined;
    }

    if (
      (kind === 'unary_expression' &&
        parent.field('operator')?.text() === '!') ||
      kind === 'template_substitution' ||
      kind === 'jsx_expression'
    ) {
      return parent;
    }

    return undefined;
  }
}

/**
 * Returns the expression that holds a value with a fallback after it
 * (`value ?? {}`, `value || {}`), or the value itself.
 */
function withFallback(node: Node): Node {
  let current = node;

  for (;;) {
    const parent = current.parent();
    const kind = parent?.kind() ?? '';

    if (kind === 'parenthesized_expression') {
      current = parent;
      continue;
    }

    if (
      kind === 'binary_expression' &&
      parent.field('left')?.id() === current.id() &&
      ['??', '||'].includes(parent.field('operator')?.text() ?? '')
    ) {
      current = parent;
      continue;
    }

    return current;
  }
}

/**
 * Returns the names that a declarator binds to a value: the name, or the
 * names of a destructuring pattern of it.
 */
function boundNames(holder: Node): Node[] {
  const name = holder.field('name');

  if (name?.kind() === 'identifier') {
    return [name];
  }

  if (name?.kind() !== 'object_pattern') {
    return [];
  }

  return name
    .children()
    .map((entry) =>
      entry.kind() === 'shorthand_property_identifier_pattern'
        ? entry
        : entry.kind() === 'pair_pattern'
          ? entry.field('value')
          : undefined
    )
    .filter(
      (entry) =>
        entry?.kind() === 'identifier' ||
        entry?.kind() === 'shorthand_property_identifier_pattern'
    );
}

/**
 * Reports for review a read of the overrides of a viewport
 * (`getDisplaySetAppearance`, or `getDisplaySetPresentation` of 6.0.0-beta.2)
 * whose value, or a key of it, is shown or compared: directly, or through a
 * `const` that holds it or destructures it. In 6.0 it gives what a caller
 * set; a readout or a toggle reads `getEffectiveDisplaySetAppearance`.
 */
function reportShownOverrides(run: Run): void {
  for (const member of run.rootNode.findAll({
    rule: {
      kind: 'member_expression',
      has: {
        field: 'property',
        regex: '^(getDisplaySetAppearance|getDisplaySetPresentation)$',
      },
    },
  })) {
    const call = member.parent();

    if (
      call?.kind() !== 'call_expression' ||
      call.field('function')?.id() !== member.id() ||
      !receiverEvidence(member.field('object'), 'viewport')
    ) {
      continue;
    }

    const value = withFallback(call);
    const holder = value.parent();
    const readers =
      holder?.kind() === 'variable_declarator' &&
      holder.field('value')?.id() === value.id()
        ? boundNames(holder).flatMap((name) => referencesOf(name))
        : [call];
    const shown = readers
      .map((reader) => showingNode(reader))
      .find((node) => node && !run.handled.has(node.range().start.index));

    if (shown) {
      report(
        run,
        'review',
        `getDisplaySetAppearance: ${SHOWN_OVERRIDES}`,
        shown
      );
    }
  }
}

/** The names of the look that an object literal may stand in for, such as a mock. */
const LOOK_KEYS: Record<string, string> = {
  ...APPEARANCE_METHODS,
  viewportSupportsDisplaySetPresentation:
    'viewportSupportsDisplaySetAppearance',
};

/**
 * Reports a key of an object literal that names a method of the look, or
 * `viewportSupportsDisplaySetPresentation`, in a file that imports
 * Cornerstone: such an object stands in for a viewport or for the
 * `utilities` of the core, as a mock of a test does, and its keys are not
 * proven to be Cornerstone's.
 */
function reportLookKeys(run: Run): void {
  if (!importsCornerstone(run)) {
    return;
  }

  for (const key of run.rootNode.findAll({
    rule: {
      kind: 'property_identifier',
      regex: `^(${Object.keys(LOOK_KEYS).join('|')})$`,
      inside: { any: [{ kind: 'pair' }, { kind: 'method_definition' }] },
    },
  })) {
    const holder = key.parent();
    const isKey =
      holder?.kind() === 'pair'
        ? holder.field('key')?.id() === key.id()
        : holder?.field('name')?.id() === key.id();

    if (
      !isKey ||
      holder?.parent()?.kind() !== 'object' ||
      run.handled.has(key.range().start.index)
    ) {
      continue;
    }

    run.handled.add(key.range().start.index);
    report(
      run,
      'manual',
      `${key.text()}: a key of an object that stands in for Cornerstone, such as a mock, in 6.0 its name is ${LOOK_KEYS[key.text()]}`,
      key
    );
  }
}

/**
 * The rewrites of the appearance that no table entry says: `colormap.opacity`
 * of an appearance literal (`rewriteColormapOpacity`), a method of the
 * look on a receiver that only the types of the file show to be a viewport,
 * and its name in an indexed type of a viewport type, are renamed; a member
 * of the look that a type of the application declares on top of a viewport
 * type, a name of the look imported from a subpath of the core, another
 * string that names a method of the look, a key of an object literal that
 * names one (`reportLookKeys`), and a method of the look on an object that
 * the file does not show to be a viewport, are reported. A
 * method of the look on a receiver of a type of the application is the
 * tables' to report (`viewportEvidence` gives `name` there).
 */
function rewriteAppearance(run: Run): void {
  rewriteColormapOpacity(run);
  rewriteAppearanceListeners(run);
  reportShownOverrides(run);
  reportMembersOfTypes(run, APPEARANCE_TYPE_MEMBERS);
  reportSubpathNames(run, new Set(), APPEARANCE_SUBPATH_NAMES);
  rewriteTypedReceivers(run);
  rewriteMethodStrings(run);
  reportLookKeys(run);
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

/** The calls of the display area of a viewport and the text that replaces them. */
const DISPLAY_AREA_CALLS: Record<
  string,
  { arity: number; text: (args: string[]) => string }
> = {
  setDisplayArea: {
    arity: 1,
    text: ([area]) =>
      area === 'displayArea'
        ? 'setViewState({ displayArea })'
        : `setViewState({ displayArea: ${area} })`,
  },
  getDisplayArea: { arity: 0, text: () => 'getViewState().displayArea' },
};

/**
 * Rewrites the display area calls of a viewport that the file shows, also
 * by its type: `viewport.setDisplayArea(area)` becomes
 * `viewport.setViewState({ displayArea: area })`, which shows the area as
 * the setter did, and `viewport.getDisplayArea()` becomes
 * `viewport.getViewState().displayArea`. An area that is not an object
 * literal can be undefined, where the setter did nothing and `setViewState`
 * clears the area: that rewrite is listed for review. A call with other
 * arguments (the `suppressEvents` of the setter) is reported; a member that
 * is not called is the table's to report.
 */
function rewriteDisplayArea(run: Run): void {
  for (const call of run.rootNode.findAll({
    rule: {
      kind: 'call_expression',
      has: {
        field: 'function',
        kind: 'member_expression',
        has: {
          field: 'property',
          regex: `^(${Object.keys(DISPLAY_AREA_CALLS).join('|')})$`,
        },
      },
    },
  })) {
    const parts = methodCall(call);

    if (
      !parts ||
      run.handled.has(parts.property.range().start.index) ||
      (receiverEvidence(parts.object, 'viewport') !== 'proven' &&
        !isTypedViewport(parts.object))
    ) {
      continue;
    }

    const { args, method, property } = parts;
    const { arity, text } = DISPLAY_AREA_CALLS[method];
    const label = method as keyof typeof DISPLAY_AREA_TEXTS;

    run.handled.add(property.range().start.index);

    if (
      args.length !== arity ||
      args.some((arg) => arg.kind() === 'spread_element')
    ) {
      report(run, 'manual', `${method}: ${DISPLAY_AREA_TEXTS[label]}`, call);
      continue;
    }

    const replacement = text(args.map((arg) => arg.text()));

    if (
      !run.edits.add({
        startPos: property.range().start.index,
        endPos: call.range().end.index,
        insertedText: replacement,
      })
    ) {
      report(
        run,
        'manual',
        `${method}: another rewrite of the line overlaps it, ${DISPLAY_AREA_TEXTS[label]}`,
        call
      );
      continue;
    }

    noteRewritten(run, `${method} -> ${text(['displayArea'])}`, call);

    if (method === 'setDisplayArea' && unwrap(args[0]).kind() !== 'object') {
      report(
        run,
        'review',
        `setDisplayArea: ${DISPLAY_AREA_TEXTS.undefinedArea}`,
        call
      );
    }
  }
}

/** The framing patches that a framing read with `getViewFraming` can reach. */
const FRAMING_PATCH_PLACES: KeyPlace[] = [
  { receiver: 'viewport', method: 'setViewFraming', argument: 0 },
  { call: 'viewportProjection.withFraming', argument: 1 },
];

/** The review text of a pan after a spread that the step could not keep. */
const PAN_AFTER_SPREAD_REVIEW =
  'a framing that getViewFraming gives has worldPan, which setViewFraming takes in place of pan: set worldPan: undefined next to this pan, or set worldPan';

/**
 * Keeps the pan of a framing patch that spreads another framing and sets
 * `pan` after it: `viewport.setViewFraming({ ...framing, pan })` becomes
 * `viewport.setViewFraming({ ...framing, worldPan: undefined, pan })`. A
 * framing that `getViewFraming` gives has `worldPan`, the pan in world
 * units, which a patch takes in place of `pan`, so without it the pan of
 * the patch would do nothing. A patch that has `worldPan` itself, or whose
 * `pan` comes before its last spread, stays as it is. A viewport shown by
 * its name alone is reported for review.
 */
function keepPanAfterSpread(run: Run): void {
  const source = run.rootNode.text();

  for (const place of FRAMING_PATCH_PLACES) {
    for (const { object, evidence } of placeObjects(run, place)) {
      const pan = entryOf(object, 'pan');
      const spreads = object
        .children()
        .filter((child) => child.kind() === 'spread_element');
      const panStart = pan?.entry.range().start.index;

      if (
        !pan ||
        !spreads.length ||
        entryOf(object, 'worldPan') ||
        panStart < spreads[spreads.length - 1].range().start.index ||
        run.handled.has(panStart)
      ) {
        continue;
      }

      run.handled.add(panStart);

      if (evidence !== 'proven') {
        report(
          run,
          'review',
          `pan: a viewport by its name only, ${PAN_AFTER_SPREAD_REVIEW}`,
          pan.entry
        );
        continue;
      }

      const lineStart = source.lastIndexOf('\n', panStart - 1) + 1;
      const prefix = source.slice(lineStart, panStart);
      const insertedText = /^\s*$/.test(prefix)
        ? `worldPan: undefined,\n${prefix}`
        : 'worldPan: undefined, ';

      if (
        !run.edits.add({ startPos: panStart, endPos: panStart, insertedText })
      ) {
        report(run, 'review', `pan: ${PAN_AFTER_SPREAD_REVIEW}`, pan.entry);
        continue;
      }

      noteRewritten(
        run,
        'pan after a spread -> worldPan: undefined, pan',
        pan.entry
      );
    }
  }
}

/**
 * The rewrites of the framing that no table entry says: the module of the
 * framing of the tools, the `presentation` of a projection snapshot, the
 * display area calls of a viewport and the pan of a patch that spreads a
 * framing. The names of the framing imported from a subpath of the core
 * and each projection adapter of the application are reported.
 */
function rewriteFraming(run: Run): void {
  const taken = rewriteModulePaths(run, FRAMING_MODULES, {});

  reportSubpathNames(run, taken, FRAMING_SUBPATH_NAMES);
  rewriteSnapshotFraming(run);
  reportProjectionAdapters(run);
  rewriteDisplayArea(run);
  keepPanAfterSpread(run);
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
