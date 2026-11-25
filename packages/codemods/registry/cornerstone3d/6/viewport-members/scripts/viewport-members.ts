import type { Codemod, Edit, SgRoot } from 'codemod:ast-grep';
import type TSX from 'codemod:ast-grep/langs/tsx';
import { useMetricAtom } from 'codemod:metrics';
import {
  CoreImports,
  EditSet,
  HeldMetric,
  analysed,
  bracketKey,
  coreImportOf,
  coreReExports,
  enclosingFunction,
  indentOf,
  isBoundTo,
  isCoreExport,
  isMountedBefore,
  isRenderingEngine,
  isRepeatable,
  keptValue,
  viewportEvidence,
  memberRule,
  methodCall,
  objectEntries,
  removeProperty,
  site,
  stableBinding,
  unwrap,
  viewportFamily,
} from './lib.ts';
import type { Node } from './lib.ts';

/** Sites that the reader changes. */
const manual = new HeldMetric(useMetricAtom('cornerstone3d-6-manual'));

/** Rewrites that the reader checks. */
const review = new HeldMetric(useMetricAtom('cornerstone3d-6-review'));

/** The members whose call keeps its arguments under a new name. */
const RENAMED_METHODS: Record<string, string> = {
  resetCameraForResize: 'resetViewStateForResize',
  getTargetImageIdIndex: 'getCurrentImageIdIndex',
  getViewPresentation: 'getViewFraming',
  setViewPresentation: 'setViewFraming',
};

/** The review note of a renamed member whose 6.0 call answers differently. */
const RENAMED_METHOD_REVIEWS: Record<string, string> = {
  getViewPresentation:
    'getViewFraming: zoom and pan are against the fit, the framing has no slab thickness and no window (read them with getDisplaySetAppearance) and no aspect ratio (the stretch is its scale), and it is undefined while the viewport shows nothing',
  setViewPresentation:
    'setViewFraming: zoom and pan are against the fit, a slab thickness or a window in the framing does nothing (set them with setDisplaySetAppearance), and an aspect ratio neither (give the stretch as scale)',
};

/**
 * The members whose call becomes a fixed read of `getActors()`, of
 * `getVolumeIds` or of `getImageData()`.
 */
const ACTOR_READS: Record<string, (args: string[]) => string | undefined> = {
  getActorUIDs: (args) =>
    args.length === 0 ? 'getActors().map((entry) => entry.uid)' : undefined,
  getAllVolumeIds: (args) =>
    args.length === 0
      ? 'getVolumeIds({ includeSegmentations: true })'
      : undefined,
  getActorByIndex: (args) =>
    args.length === 1 ? `getActors()[${args[0]}]` : undefined,
  getActorUIDByIndex: (args) =>
    args.length === 1 ? `getActors()[${args[0]}]?.uid` : undefined,
  getBounds: (args) =>
    args.length === 0 ? 'getImageData()?.imageData.getBounds?.()' : undefined,
};

/**
 * The review note of a rewritten read whose answer can differ from what the
 * legacy member gave.
 */
const ACTOR_READ_REVIEWS: Record<string, string> = {
  getAllVolumeIds:
    'getAllVolumeIds: getVolumeIds gives the source first, [] while the viewport shows a stack, and no labelmap that the tools draw as images beside a slice cut on the CPU',
};

/** The members whose call becomes a function of the core `utilities`. */
const UTILITY_CALLS: Record<
  string,
  { name: string; arity: number; suffix?: string }
> = {
  isInAcquisitionPlane: { name: 'isInAcquisitionPlane', arity: 0 },
  getSlicesClippingPlanes: { name: 'getSlicesClippingPlanes', arity: 0 },
  getVtkDisplayCoords: { name: 'getVtkDisplayCoords', arity: 1 },
  getCurrentSlicePixelData: {
    name: 'getCurrentVolumeViewportSlice',
    arity: 0,
    suffix: '.scalarData',
  },
};

/** The properties that a read on a viewport renames. */
const RENAMED_PROPERTIES: Record<string, string> = {
  isDisabled: 'isDestroyed',
  uid: 'id',
  fps: 'getFrameRate()',
  numberOfFrames: 'getNumberOfFrames()',
};

/** The legacy members that the transform reports on a viewport. */
const REPORTED_METHODS = new Set([
  'getProperties',
  'resetProperties',
  'setDefaultProperties',
  'getDefaultProperties',
  'clearDefaultProperties',
  'resetToDefaultProperties',
  'getCamera',
  'getActor',
  'addActor',
  'addActors',
  'setActors',
  'removeActors',
  'removeAllActors',
  'getWidget',
  'getSliceViewInfo',
  'getSliceInfo',
  'getImageDataMetadata',
  'getImagePlaneReferenceData',
  'getIntensityFromWorld',
  'jumpToWorld',
  'setBestOrentation',
  'setViewPlane',
  'flip',
  'setBlendMode',
  'getBlendMode',
  'setSlabThickness',
  'getSlabThickness',
  'resetSlabThickness',
  'setSampleDistanceMultiplier',
  'unsetColormap',
  'createVTKImageData',
  'setUseCPURendering',
  'getSlicePlaneCoordinates',
  'togglePlayPause',
  'setScrollSpeed',
  'setTime',
  'setVOI',
  'setWindowLevel',
  'setChannelVisibility',
  'getFrameRange',
  'getMiddleSliceData',
  'updateCameraClippingPlanesAndRange',
  'setOrientationOfClippingPlanes',
  'getClippingPlanesForActor',
  'getAspectRatio',
  'setAspectRatio',
  'getSliceIndexForImage',
]);

/**
 * The members that a viewport of one family lost in 6.0, with what to call
 * instead. The other families keep the name, so a site is reported only on
 * a viewport that the file shows to be of that family.
 */
const FAMILY_REPORTS: Partial<Record<string, Record<string, string>>> = {
  '3d': {
    setOrientation:
      'a 3D viewport has no setOrientation in 6.0: viewport.setViewState({ viewPlaneNormal, viewUp }), then viewport.resetViewState()',
    getImageActor:
      'a 3D viewport has no getImageActor in 6.0: viewport.getActors().find((entry) => entry.referencedId === volumeId)?.actor',
    hasImageURI:
      'a 3D viewport has no hasImageURI in 6.0: viewport.isReferenceViewable({ referencedImageURI }, { withNavigation: true })',
    getCurrentImageIdIndex: 'a 3D viewport has no slices in 6.0',
    getSliceIndex: 'a 3D viewport has no slices in 6.0',
    getCurrentImageId: 'a 3D viewport has no slices in 6.0',
    getNumberOfSlices: 'a 3D viewport has no slices in 6.0',
    getRotation:
      'a 3D viewport has no getRotation in 6.0: read the camera with viewport.getViewState()',
    scroll: 'a 3D viewport has no slices in 6.0',
  },
  video: {
    end: 'a video viewport has no end in 6.0: viewport.seek(timeSeconds), the start is 0',
    hasImageURI:
      'a video viewport has no hasImageURI in 6.0: viewport.isReferenceViewable({ referencedImageURI }, { withNavigation: true })',
  },
  ecg: {
    getNumberOfSlices:
      'an ECG viewport has no getNumberOfSlices in 6.0: an ECG is one record and has no slices',
  },
};

/** The member names of `FAMILY_REPORTS`. */
const FAMILY_METHODS = new Set(
  Object.values(FAMILY_REPORTS).flatMap((methods) => Object.keys(methods ?? {}))
);

/** The legacy properties that the transform reports on a viewport. */
const REPORTED_PROPERTIES = new Set([
  'requestedType',
  'sx',
  'sy',
  'sWidth',
  'sHeight',
  '_actors',
  'suppressEvents',
  'scaling',
  'stackActorReInitialized',
  'useCPURendering',
]);

/** The removed exports of the core that the transform reports. */
const REPORTED_CORE_NAMES = new Set([
  'viewportSupportsStackCompatibility',
  'viewportSupportsVolumeCompatibility',
  'StackCompatibilityViewport',
  'VolumeCompatibilityViewport',
  'getVolumeViewportScrollInfo',
  'getImageSliceDataForVolumeViewport',
  'getVolumeSliceRangeInfo',
  'getImageLegacy',
  'ECGUtilities',
  'scrollVolume',
]);

/** The removed members of a rendering engine that the transform reports. */
const REPORTED_ENGINE_MEMBERS = new Set(['renderFrameOfReference']);

/** The keys of `setProperties` that are keys of the appearance too. */
const APPEARANCE_KEYS = new Set([
  'voiRange',
  'invert',
  'colormap',
  'interpolationType',
  'sharpening',
  'smoothing',
  'loop',
  'muted',
  'playbackRate',
  'showAmplitudeLabels',
]);

/** The keys of `setProperties` that are keys of the appearance of a 3D viewport only. */
const THREE_D_APPEARANCE_KEYS = new Set(['preset', 'sampleDistanceMultiplier']);

/** The keys of `setProperties` that change their name in the appearance. */
const RENAMED_APPEARANCE_KEYS: Record<string, string> = {
  VOILUTFunction: 'voiLUTFunction',
};

/** The keys of the ECG `setProperties` that are keys of its view state. */
const ECG_VIEW_KEYS: Record<string, string> = {
  visibleChannels: 'visibleChannels',
  sweepSpeed: 'sweepSpeed',
  sensitivityMmMv: 'sensitivityMmMv',
  traceLayout: 'traceLayout',
  layoutType: 'traceLayout',
};

/** The keys of `resetCamera` that `resetViewState` takes. */
const RESET_KEYS = new Set(['resetPan', 'resetZoom', 'resetOrientation']);

/** The keys of `setCamera` that the view state of a planar viewport takes. */
const FLIP_KEYS = new Set(['flipHorizontal', 'flipVertical']);

/** The calls that mount data on a viewport. */
const MOUNT_CALL = /\.(setDisplaySets|setStack|setVolumes|setVideo)\(/;

/**
 * The state of one run of the transform on a file.
 */
interface Run {
  root: SgRoot<TSX>;
  rootNode: Node;
  imports: CoreImports;
  edits: EditSet;
}

/**
 * Returns an edit that replaces the text from the property of a member call
 * to the end of the call, so the receiver stays as it is.
 */
function replaceFromProperty(call: Node, property: Node, text: string): Edit {
  return {
    startPos: property.range().start.index,
    endPos: call.range().end.index,
    insertedText: text,
  };
}

/**
 * Reports a site and returns false, for a rewrite that does not apply.
 */
function reportSite(run: Run, rule: string, node: Node): false {
  manual.increment(site(run.root, rule, node));

  return false;
}

/**
 * Returns the keys of an object literal argument with their entries, or
 * undefined when the argument is not a plain object literal.
 */
function literalKeys(arg: Node | undefined): string[] | undefined {
  if (arg?.kind() !== 'object') {
    return undefined;
  }

  const { keys, hasSpread } = objectEntries(arg);

  return hasSpread ? undefined : keys;
}

/**
 * Tells whether the appearance of the source display set can be set at a
 * call: the receiver is a name whose binding holds one value, a statement
 * that awaits a mount on that binding runs before the call in its function,
 * and no mount on that binding comes after the call in its function or runs
 * before it without `await`. A mount under a condition or in another
 * function proves nothing: 6.0 drops an appearance that is set before the
 * first mount, where 5.x kept it.
 */
function isMountedAt(run: Run, call: Node, receiver: Node): boolean {
  const target = unwrap(receiver);
  const binding =
    target.kind() === 'identifier' ? stableBinding(target) : undefined;

  if (!binding || !isMountedBefore(call, receiver)) {
    return false;
  }

  const scope = enclosingFunction(call) ?? run.rootNode;
  const start = call.range().start.index;

  for (const other of scope.findAll({ rule: { kind: 'call_expression' } })) {
    const parts = methodCall(other);

    if (
      !parts ||
      !isBoundTo(unwrap(parts.object), binding) ||
      !MOUNT_CALL.test(`.${parts.method}(`)
    ) {
      continue;
    }

    if (other.range().start.index > start) {
      return false;
    }

    if (other.parent()?.kind() !== 'await_expression') {
      return false;
    }
  }

  return true;
}

/**
 * Returns the name of a key of a pair, without the quotes of a string key.
 */
function keyName(key: Node): string {
  return key.kind() === 'string' ? key.text().slice(1, -1) : key.text();
}

/**
 * Returns the text of an object literal with the keys of its pairs renamed by
 * a map of key names, and with the edits of `extra` inside it. A quoted key
 * keeps its quotes.
 */
function renameKeys(
  objectNode: Node,
  names: Record<string, string>,
  extra: Edit[] = []
): string {
  const offset = objectNode.range().start.index;
  const keyEdits = objectNode
    .children()
    .filter((child) => child.kind() === 'pair')
    .map((pair) => pair.field('key'))
    .filter(
      (key) =>
        key && names[keyName(key)] && names[keyName(key)] !== keyName(key)
    )
    .map((key): Edit => {
      const quote = key.kind() === 'string' ? key.text()[0] : '';

      return {
        startPos: key.range().start.index,
        endPos: key.range().end.index,
        insertedText: `${quote}${names[keyName(key)]}${quote}`,
      };
    });
  let text = objectNode.text();

  for (const edit of [...keyEdits, ...extra].sort(
    (a, b) => b.startPos - a.startPos
  )) {
    text = `${text.slice(0, edit.startPos - offset)}${edit.insertedText}${text.slice(edit.endPos - offset)}`;
  }

  return text;
}

/** The text of a report of `colormap.opacity`, word for word in the guide. */
const COLORMAP_OPACITY =
  'colormap.opacity is gone: a number is the opacity of the appearance (opacity beside the colormap), a list of { value, opacity } points is colormap.opacityMapping';

/** The calls that give an array. */
const ARRAY_METHODS = new Set(['map', 'filter', 'slice', 'concat', 'flatMap']);

/**
 * The literal that an expression holds: the expression, or the value of the
 * `const` that a name refers to, through parentheses and casts.
 */
function heldLiteral(
  node: Node | null | undefined,
  depth = 0
): Node | undefined {
  if (!node || depth > 2) {
    return undefined;
  }

  const inner = unwrap(node);
  const kind = inner.kind();

  if (kind !== 'identifier' && kind !== 'shorthand_property_identifier') {
    return inner;
  }

  const declaration = stableBinding(inner);
  const holder = declaration?.parent();
  const value =
    holder?.kind() === 'variable_declarator' &&
    holder.field('name')?.id() === declaration.id()
      ? holder.field('value')
      : undefined;

  return value ? heldLiteral(value, depth + 1) : undefined;
}

/**
 * What a value of `colormap.opacity` is: a number, a list of points, or
 * unknown.
 */
function opacityKind(value: Node | undefined): 'number' | 'list' | undefined {
  const literal = heldLiteral(value);
  const kind = literal?.kind();

  if (
    kind === 'number' ||
    (kind === 'unary_expression' && /^[-+]\s*[\d.]/.test(literal.text()))
  ) {
    return 'number';
  }

  if (kind === 'array') {
    return 'list';
  }

  const callee =
    kind === 'call_expression' ? unwrap(literal.field('function')) : undefined;

  if (
    callee?.kind() === 'member_expression' &&
    ARRAY_METHODS.has(callee.field('property')?.text() ?? '')
  ) {
    return 'list';
  }

  return callee?.text() === 'Array.from' || callee?.text() === 'Array.of'
    ? 'list'
    : undefined;
}

/**
 * The edits that write `colormap.opacity` of the literal of `setProperties`
 * in the form of 6.0, where there is one opacity: a list of points becomes
 * `colormap.opacityMapping`, a number becomes the `opacity` of the
 * appearance beside the colormap. A reason when the value is not a number or
 * a list that the file shows; no edits without `colormap.opacity`.
 */
function colormapOpacityEdits(
  rootNode: Node,
  objectNode: Node
): { edits: Edit[] } | { reason: string } {
  const colormapPair = objectNode
    .children()
    .find(
      (child) =>
        child.kind() === 'pair' && keyName(child.field('key')) === 'colormap'
    );
  const colormap = colormapPair?.field('value')
    ? unwrap(colormapPair.field('value'))
    : undefined;
  const entry =
    colormap?.kind() === 'object'
      ? colormap
          .children()
          .find(
            (child) =>
              (child.kind() === 'pair' &&
                keyName(child.field('key')) === 'opacity') ||
              (child.kind() === 'shorthand_property_identifier' &&
                child.text() === 'opacity')
          )
      : undefined;

  if (!entry) {
    return { edits: [] };
  }

  const isShorthand = entry.kind() === 'shorthand_property_identifier';
  const value = isShorthand ? entry : entry.field('value');
  const kind = opacityKind(value);

  if (kind === 'list') {
    if (objectEntries(colormap).keys.includes('opacityMapping')) {
      return { reason: 'the colormap has an opacityMapping too' };
    }

    const key = isShorthand ? entry : entry.field('key');

    return {
      edits: [
        {
          startPos: key.range().start.index,
          endPos: key.range().end.index,
          insertedText: isShorthand
            ? 'opacityMapping: opacity'
            : 'opacityMapping',
        },
      ],
    };
  }

  if (kind !== 'number') {
    return {
      reason: 'its value is not a number or a list that the file shows',
    };
  }

  const opacityText = isShorthand ? 'opacity' : `opacity: ${value.text()}`;
  const others = colormap
    .children()
    .filter(
      (child) =>
        child.isNamed() &&
        child.kind() !== 'comment' &&
        child.id() !== entry.id()
    );

  if (!others.length) {
    return {
      edits: [
        {
          startPos: colormapPair.range().start.index,
          endPos: colormapPair.range().end.index,
          insertedText: opacityText,
        },
      ],
    };
  }

  const end = colormapPair.range().end.index;
  const separator =
    colormapPair.range().start.line > objectNode.range().start.line
      ? `,\n${indentOf(rootNode, colormapPair)}`
      : ', ';

  return {
    edits: [
      removeProperty(entry),
      {
        startPos: end,
        endPos: end,
        insertedText: `${separator}${opacityText}`,
      },
    ],
  };
}

/**
 * Rewrites `viewport.setProperties({ ... })` of known keys.
 */
function rewriteSetProperties(
  run: Run,
  call: Node,
  object: Node,
  property: Node,
  args: Node[]
): boolean {
  const keys = literalKeys(args[0]);

  if (args.length !== 1 || !keys) {
    return reportSite(run, 'setProperties: not one object literal', call);
  }

  if (
    args[0]
      .children()
      .some(
        (child) =>
          child.kind() === 'shorthand_property_identifier' &&
          RENAMED_APPEARANCE_KEYS[child.text()]
      )
  ) {
    return reportSite(
      run,
      'setProperties: a shorthand key that changes its name',
      call
    );
  }

  const isThreeD = viewportFamily(object) === '3d';
  const isAppearanceKey = (key: string) =>
    APPEARANCE_KEYS.has(key) ||
    Boolean(RENAMED_APPEARANCE_KEYS[key]) ||
    (isThreeD && THREE_D_APPEARANCE_KEYS.has(key));
  const isAppearance = keys.every(isAppearanceKey);
  const isEcgView =
    keys.length > 0 &&
    keys.every((key) => ECG_VIEW_KEYS[key]) &&
    !args[0]
      .children()
      .some(
        (child) =>
          child.kind() === 'shorthand_property_identifier' &&
          child.text() === 'layoutType'
      );

  if (!isAppearance && !isEcgView) {
    const key = keys.find((name) => !isAppearanceKey(name));

    return reportSite(run, `setProperties: the key ${key}`, call);
  }

  if (isAppearance && !isMountedAt(run, call, object)) {
    return reportSite(
      run,
      'setProperties: the viewport may not show its data yet',
      call
    );
  }

  const colormap = isAppearance
    ? colormapOpacityEdits(run.rootNode, args[0])
    : { edits: [] };

  if ('reason' in colormap) {
    return reportSite(
      run,
      `setProperties: colormap.opacity: ${colormap.reason}, ${COLORMAP_OPACITY}`,
      call
    );
  }

  const method = isEcgView ? 'setViewState' : 'setDisplaySetAppearance';
  const names = isEcgView ? ECG_VIEW_KEYS : RENAMED_APPEARANCE_KEYS;

  return run.edits.add(
    property.replace(method),
    args[0].replace(renameKeys(args[0], names, colormap.edits))
  );
}

/**
 * Tells whether the value of a call is read for its flip only: a pattern
 * that takes nothing but `flipHorizontal` and `flipVertical`
 * (`const { flipHorizontal } = viewport.getCamera()`), or one of the two
 * read from it (`viewport.getCamera().flipVertical`). The view state of a
 * planar viewport holds both.
 */
function readsOnlyFlip(call: Node): boolean {
  const value = keptValue(call);
  const parent = value.parent();

  if (parent?.kind() === 'member_expression') {
    return FLIP_KEYS.has(parent.field('property')?.text() ?? '');
  }

  const pattern =
    parent?.kind() === 'variable_declarator' &&
    parent.field('value')?.id() === value.id()
      ? parent.field('name')
      : undefined;

  if (pattern?.kind() !== 'object_pattern') {
    return false;
  }

  const entries = pattern.children().filter((child) => child.isNamed());

  return (
    entries.length > 0 &&
    entries.every((entry) => {
      const key =
        entry.kind() === 'shorthand_property_identifier_pattern'
          ? entry
          : entry.kind() === 'pair_pattern'
            ? entry.field('key')
            : undefined;

      return FLIP_KEYS.has(key?.text() ?? '');
    })
  );
}

/**
 * Rewrites or reports one call of a legacy member on a viewport. A receiver
 * that only its name shows to be a viewport is reported.
 */
function rewriteCall(run: Run, call: Node): void {
  const parts = methodCall(call);
  const evidence = parts ? viewportEvidence(parts.object) : undefined;

  if (!evidence) {
    return;
  }

  const { object, property, method, args } = parts;

  if (FAMILY_METHODS.has(method)) {
    const family = evidence === 'core' ? viewportFamily(object) : undefined;
    const text = family ? FAMILY_REPORTS[family]?.[method] : undefined;

    if (text) {
      reportSite(run, `${method}: ${text}`, call);
    }

    return;
  }

  if (evidence === 'name') {
    reportSite(run, memberRule(method, object), call);

    return;
  }
  const argTexts = args.map((arg) => arg.text());

  if (RENAMED_METHODS[method]) {
    run.edits.add(property.replace(RENAMED_METHODS[method]));

    if (RENAMED_METHOD_REVIEWS[method]) {
      review.increment(site(run.root, RENAMED_METHOD_REVIEWS[method], call));
    }

    return;
  }

  if (ACTOR_READS[method]) {
    const text = ACTOR_READS[method](argTexts);

    if (!text || !run.edits.add(replaceFromProperty(call, property, text))) {
      reportSite(run, method, call);
    } else if (ACTOR_READ_REVIEWS[method]) {
      review.increment(site(run.root, ACTOR_READ_REVIEWS[method], call));
    }

    return;
  }

  if (UTILITY_CALLS[method]) {
    const { name, arity, suffix = '' } = UTILITY_CALLS[method];
    const utilities =
      args.length === arity
        ? run.imports.ensure('utilities', { at: call })
        : undefined;
    const callArgs = [unwrap(object).text(), ...argTexts].join(', ');

    if (
      !utilities ||
      !run.edits.add(call.replace(`${utilities}.${name}(${callArgs})${suffix}`))
    ) {
      reportSite(run, method, call);
    }

    return;
  }

  switch (method) {
    case 'resetCamera': {
      const keys = args.length === 0 ? [] : literalKeys(args[0]);

      if (
        args.length > 1 ||
        !keys ||
        keys.some((key) => !RESET_KEYS.has(key))
      ) {
        reportSite(run, 'resetCamera: options without a twin', call);
      } else {
        run.edits.add(property.replace('resetViewState'));
      }

      return;
    }

    case 'setProperties':
      rewriteSetProperties(run, call, object, property, args);

      return;

    case 'getCamera':
      if (
        !args.length &&
        readsOnlyFlip(call) &&
        viewportFamily(object) === 'planar'
      ) {
        run.edits.add(property.replace('getViewState'));
      } else {
        reportSite(run, method, call);
      }

      return;

    case 'setCamera': {
      const keys = literalKeys(args[0]);

      if (
        args.length === 1 &&
        keys?.length &&
        keys.every((key) => FLIP_KEYS.has(key)) &&
        viewportFamily(object) === 'planar'
      ) {
        run.edits.add(property.replace('setViewState'));
      } else {
        reportSite(run, 'setCamera', call);
      }

      return;
    }

    case 'isOrientationChangeable': {
      const enums =
        isRepeatable(object) && !args.length
          ? run.imports.ensure('Enums', { at: call })
          : undefined;
      const utilities = enums
        ? run.imports.ensure('utilities', { at: call })
        : undefined;
      const viewport = unwrap(object).text();

      if (
        !utilities ||
        !run.edits.add(
          call.replace(
            `(${viewport}.type === ${enums}.ViewportType.VOLUME_3D || ${utilities}.viewportIsInVolumeMode(${viewport}))`
          )
        )
      ) {
        reportSite(run, method, call);
      }

      return;
    }

    case 'getCornerstoneImage': {
      const cache =
        args.length === 0
          ? run.imports.ensure('cache', { at: call })
          : undefined;

      if (
        !cache ||
        !run.edits.add(
          call.replace(
            `${cache}.getImage(${object.text()}.getCurrentImageId())`
          )
        )
      ) {
        reportSite(run, method, call);
      }

      return;
    }

    case 'setAverageWhite':
      if (args.length === 1 && !isMountedAt(run, call, object)) {
        reportSite(
          run,
          'setAverageWhite: the viewport may not show its data yet',
          call
        );
      } else if (args.length === 1) {
        run.edits.add(
          property.replace('setDisplaySetAppearance'),
          call.field('arguments').replace(`({ averageWhite: ${argTexts[0]} })`)
        );
      } else {
        reportSite(run, method, call);
      }

      return;

    case 'setFrameRange':
      if (args.length === 1) {
        run.edits.add(
          property.replace('setViewState'),
          call.field('arguments').replace(`({ frameRange: ${argTexts[0]} })`)
        );
      } else {
        reportSite(run, method, call);
      }

      return;

    default:
      if (REPORTED_METHODS.has(method)) {
        reportSite(run, method, call);
      }
  }
}

/**
 * Rewrites or reports one read of a legacy property on a viewport.
 */
function rewriteProperty(run: Run, member: Node): void {
  const object = member.field('object');
  const property = member.field('property');
  const name = property?.text() ?? '';
  const parent = member.parent();
  const evidence = object ? viewportEvidence(object) : undefined;

  if (
    !evidence ||
    (parent?.kind() === 'call_expression' &&
      parent.field('function')?.id() === member.id())
  ) {
    return;
  }

  if (evidence === 'name') {
    reportSite(run, memberRule(name, member.field('object')), member);

    return;
  }

  const isWrite =
    (parent?.kind() === 'assignment_expression' ||
      parent?.kind() === 'augmented_assignment_expression') &&
    parent.field('left')?.id() === member.id();

  if (REPORTED_PROPERTIES.has(name) || isWrite) {
    reportSite(run, name, member);

    return;
  }

  if (name === 'modality') {
    const utilities = run.imports.ensure('utilities', { at: member });

    if (
      !utilities ||
      !run.edits.add(
        member.replace(
          `${utilities}.getViewportModality(${unwrap(object).text()})`
        )
      )
    ) {
      reportSite(run, name, member);
    }

    return;
  }

  run.edits.add(property.replace(RENAMED_PROPERTIES[name]));
}

/**
 * Reports the uses of the removed exports of the core.
 */
function reportCoreNames(run: Run): void {
  const names = [...REPORTED_CORE_NAMES].join('|');

  for (const node of run.rootNode.findAll({
    rule: {
      any: [
        { kind: 'identifier' },
        { kind: 'type_identifier' },
        { kind: 'property_identifier' },
      ],
      regex: `^(${names})$`,
    },
  })) {
    if (
      node
        .ancestors()
        .some((ancestor) => ancestor.kind() === 'import_statement')
    ) {
      continue;
    }

    const name = node.text();
    const parent = node.parent();
    const fromImport =
      node.kind() !== 'property_identifier' && coreImportOf(node, true);
    const fromUtilities =
      node.kind() === 'property_identifier' &&
      parent?.kind() === 'member_expression' &&
      isCoreExport(parent.field('object'), 'utilities');

    if (fromImport || fromUtilities) {
      reportSite(run, name, node);
    }
  }

  for (const { specifier, name } of coreReExports(run.rootNode)) {
    if (REPORTED_CORE_NAMES.has(name)) {
      reportSite(run, name, specifier);
    }
  }
}

/**
 * Reports the removed members of a rendering engine of the core, such as
 * `renderingEngine.renderFrameOfReference(frameOfReferenceUID)`, also in
 * brackets.
 */
function reportEngineMembers(run: Run): void {
  const names = [...REPORTED_ENGINE_MEMBERS].join('|');

  for (const node of run.rootNode.findAll({
    rule: {
      any: [
        {
          kind: 'member_expression',
          has: { field: 'property', regex: `^(${names})$` },
        },
        { kind: 'subscript_expression' },
      ],
    },
  })) {
    const name =
      node.kind() === 'member_expression'
        ? node.field('property')?.text()
        : bracketKey(node);

    if (
      name &&
      REPORTED_ENGINE_MEMBERS.has(name) &&
      isRenderingEngine(node.field('object'))
    ) {
      reportSite(run, name, node);
    }
  }
}

/**
 * Reports a bracket access with a string key to a legacy member on a
 * viewport, such as `viewport['getProperties']()`: it names the member that
 * `viewport.getProperties` names, so it is reported where the dot form is
 * rewritten or reported.
 */
function reportBracketMembers(run: Run, names: Set<string>): void {
  for (const node of run.rootNode.findAll({
    rule: { kind: 'subscript_expression' },
  })) {
    const name = bracketKey(node);
    const object = node.field('object');

    if (name && names.has(name) && object && viewportEvidence(object)) {
      reportSite(run, name, node);
    }
  }
}

/**
 * Rewrites the members of the legacy viewports that have a fixed 6.0 call:
 * `resetCamera`, `setProperties` of appearance keys, the actor reads, the
 * questions that became functions of `utilities`, and the renamed
 * properties. Every other legacy member on a viewport is reported, and so
 * are the removed helpers of the core and the removed members of a
 * rendering engine.
 */
const codemod: Codemod<TSX> = (root) => {
  const rootNode = root.root();
  const run: Run = {
    root,
    rootNode,
    imports: new CoreImports(rootNode),
    edits: new EditSet(),
  };
  const methodNames = [
    ...Object.keys(RENAMED_METHODS),
    ...Object.keys(ACTOR_READS),
    ...Object.keys(UTILITY_CALLS),
    ...REPORTED_METHODS,
    ...FAMILY_METHODS,
    'resetCamera',
    'setProperties',
    'setCamera',
    'isOrientationChangeable',
    'getCornerstoneImage',
    'setAverageWhite',
    'setFrameRange',
  ];
  const calls = rootNode.findAll({
    rule: {
      kind: 'call_expression',
      has: {
        field: 'function',
        kind: 'member_expression',
        has: { field: 'property', regex: `^(${methodNames.join('|')})$` },
      },
    },
  });

  for (const call of calls) {
    rewriteCall(run, call);
  }

  const propertyNames = [
    ...Object.keys(RENAMED_PROPERTIES),
    ...REPORTED_PROPERTIES,
    'modality',
  ];
  const members = rootNode.findAll({
    rule: {
      kind: 'member_expression',
      has: { field: 'property', regex: `^(${propertyNames.join('|')})$` },
    },
  });

  for (const member of members) {
    rewriteProperty(run, member);
  }

  reportBracketMembers(
    run,
    new Set(
      [...methodNames, ...propertyNames].filter(
        (name) => !FAMILY_METHODS.has(name)
      )
    )
  );
  reportCoreNames(run);
  reportEngineMembers(run);

  const importEdits = run.imports.edits();

  if (!run.edits.all().length && !importEdits.length) {
    return null;
  }

  return rootNode.commitEdits([...run.edits.all(), ...importEdits]);
};

export default analysed(codemod, manual, review);
