import type { Codemod, Edit, SgRoot } from 'codemod:ast-grep';
import type TSX from 'codemod:ast-grep/langs/tsx';
import { useMetricAtom } from 'codemod:metrics';
import {
  CoreImports,
  EditSet,
  bracketKey,
  coreImportOf,
  coreReExports,
  enclosingFunction,
  isBoundTo,
  isCoreExport,
  isMountedBefore,
  isRepeatable,
  viewportEvidence,
  methodCall,
  objectEntries,
  site,
  stableBinding,
  unwrap,
  viewportFamily,
} from './lib.ts';
import type { Node } from './lib.ts';

/** Sites that the reader changes. */
const manual = useMetricAtom('cornerstone3d-6-manual');

/** The members whose call keeps its arguments under a new name. */
const RENAMED_METHODS: Record<string, string> = {
  resetCameraForResize: 'resetViewStateForResize',
  getTargetImageIdIndex: 'getCurrentImageIdIndex',
};

/** The members whose call becomes a fixed read of `getActors()`. */
const ACTOR_READS: Record<string, (args: string[]) => string | undefined> = {
  getActorUIDs: (args) =>
    args.length === 0 ? 'getActors().map((entry) => entry.uid)' : undefined,
  getAllVolumeIds: (args) =>
    args.length === 0
      ? 'getActors().map((entry) => entry.referencedId)'
      : undefined,
  getActorByIndex: (args) =>
    args.length === 1 ? `getActors()[${args[0]}]` : undefined,
  getActorUIDByIndex: (args) =>
    args.length === 1 ? `getActors()[${args[0]}]?.uid` : undefined,
  getBounds: (args) =>
    args.length === 0 ? 'getImageData().imageData.getBounds()' : undefined,
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
  'getViewPresentation',
  'setViewPresentation',
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
  'setOptions',
  'reset',
  'getSliceIndexForImage',
]);

/** The legacy properties that the transform reports on a viewport. */
const REPORTED_PROPERTIES = new Set([
  'requestedType',
  'sx',
  'sy',
  'sWidth',
  'sHeight',
  '_actors',
  'options',
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

/** The keys of `setProperties` that are keys of the presentation too. */
const PRESENTATION_KEYS = new Set([
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

/** The keys of `setProperties` that are keys of the presentation of a 3D viewport only. */
const THREE_D_PRESENTATION_KEYS = new Set([
  'preset',
  'sampleDistanceMultiplier',
]);

/** The keys of `setProperties` that change their name in the presentation. */
const RENAMED_PRESENTATION_KEYS: Record<string, string> = {
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
 * Tells whether the presentation of the source display set can be set at a
 * call: the receiver is a name whose binding holds one value, a statement
 * that awaits a mount on that binding runs before the call in its function,
 * and no mount on that binding comes after the call in its function or runs
 * before it without `await`. A mount under a condition or in another
 * function proves nothing: 6.0 drops a presentation that is set before the
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
 * a map of key names. A quoted key keeps its quotes.
 */
function renameKeys(objectNode: Node, names: Record<string, string>): string {
  const offset = objectNode.range().start.index;
  const keys = objectNode
    .children()
    .filter((child) => child.kind() === 'pair')
    .map((pair) => pair.field('key'))
    .filter(
      (key) =>
        key && names[keyName(key)] && names[keyName(key)] !== keyName(key)
    )
    .reverse();
  let text = objectNode.text();

  for (const key of keys) {
    const start = key.range().start.index - offset;
    const end = key.range().end.index - offset;
    const quote = key.kind() === 'string' ? key.text()[0] : '';

    text = `${text.slice(0, start)}${quote}${names[keyName(key)]}${quote}${text.slice(end)}`;
  }

  return text;
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
          RENAMED_PRESENTATION_KEYS[child.text()]
      )
  ) {
    return reportSite(
      run,
      'setProperties: a shorthand key that changes its name',
      call
    );
  }

  const isThreeD = viewportFamily(object) === '3d';
  const isPresentationKey = (key: string) =>
    PRESENTATION_KEYS.has(key) ||
    Boolean(RENAMED_PRESENTATION_KEYS[key]) ||
    (isThreeD && THREE_D_PRESENTATION_KEYS.has(key));
  const isPresentation = keys.every(isPresentationKey);
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

  if (!isPresentation && !isEcgView) {
    const key = keys.find((name) => !isPresentationKey(name));

    return reportSite(run, `setProperties: the key ${key}`, call);
  }

  if (isPresentation && !isMountedAt(run, call, object)) {
    return reportSite(
      run,
      'setProperties: the viewport may not show its data yet',
      call
    );
  }

  const method = isEcgView ? 'setViewState' : 'setDisplaySetPresentation';
  const names = isEcgView ? ECG_VIEW_KEYS : RENAMED_PRESENTATION_KEYS;

  return run.edits.add(
    property.replace(method),
    args[0].replace(renameKeys(args[0], names))
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

  if (evidence === 'name') {
    reportSite(run, method, call);

    return;
  }
  const argTexts = args.map((arg) => arg.text());

  if (RENAMED_METHODS[method]) {
    run.edits.add(property.replace(RENAMED_METHODS[method]));

    return;
  }

  if (ACTOR_READS[method]) {
    const text = ACTOR_READS[method](argTexts);

    if (!text || !run.edits.add(replaceFromProperty(call, property, text))) {
      reportSite(run, method, call);
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
          property.replace('setDisplaySetPresentation'),
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
    reportSite(run, name, member);

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
 * `resetCamera`, `setProperties` of presentation keys, the actor reads, the
 * questions that became functions of `utilities`, and the renamed
 * properties. Every other legacy member on a viewport is reported, and so
 * are the removed helpers of the core.
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

  reportBracketMembers(run, new Set([...methodNames, ...propertyNames]));
  reportCoreNames(run);

  const importEdits = run.imports.edits();

  if (!run.edits.all().length && !importEdits.length) {
    return null;
  }

  return rootNode.commitEdits([...run.edits.all(), ...importEdits]);
};

export default codemod;
