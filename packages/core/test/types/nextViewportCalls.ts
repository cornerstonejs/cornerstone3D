/**
 * The calls that an application writes with a next viewport, as the 6.0
 * migration guide gives them. This file is compiled and never run: the test
 * `nextViewportTypes.jest.js` runs the compiler on it and expects no error.
 *
 * It holds no cast. A call that needs one here needs one in an application.
 */
import {
  attachFidelityIndicator,
  canReportFidelity,
  detachFidelityIndicator,
  ECGGenericViewport,
  Enums,
  GenericVolumeViewport3D,
  init,
  maybeAttachFidelityIndicator,
  utilities,
  VideoGenericViewport,
  viewportProjection,
  WSIGenericViewport,
} from '../../src';
import type {
  ECGViewport,
  PlanarResolvedICamera,
  PlanarViewport,
  RenderingEngine,
  Types,
  VideoViewport,
  VolumeViewport3D,
  WSIViewport,
} from '../../src';

declare const planar: PlanarViewport;
declare const volume3D: VolumeViewport3D;
declare const video: VideoViewport;
declare const wholeSlide: WSIViewport;
declare const ecg: ECGViewport;
declare const generic: Types.IGenericViewport;
declare const viewport: Types.IViewport;
declare const enabledElement: Types.IEnabledElement;
declare const renderingEngine: RenderingEngine;
declare const viewportId: string;
declare const displaySetId: string;
declare const point: Types.Point3;
declare const orientation: Enums.OrientationAxis;

/**
 * The class of every family is a `Types.IViewport`, and so is what the
 * rendering engine and the enabled element give.
 */
export const nextViewports: Types.IViewport[] = [
  planar,
  volume3D,
  video,
  wholeSlide,
  ecg,
  generic,
  viewport,
  enabledElement.viewport,
  renderingEngine.getViewport(viewportId),
  renderingEngine.getViewport<Types.IViewport>(viewportId),
  ...renderingEngine.getViewports(),
];

/** The deprecated name takes every viewport too. */
export const viewportsOfTheLibrary: Types.IGenericViewport[] = [
  planar,
  volume3D,
  video,
  wholeSlide,
  ecg,
  viewport,
  enabledElement.viewport,
];

/**
 * The deprecated 5.x class names are the same classes: as types, both ways,
 * and as values.
 */
export const classesByTheirDeprecatedNames: [
  GenericVolumeViewport3D,
  VideoGenericViewport,
  WSIGenericViewport,
  ECGGenericViewport,
] = [volume3D, video, wholeSlide, ecg];
export const deprecatedNamesOfTheClasses: [
  VolumeViewport3D,
  VideoViewport,
  WSIViewport,
  ECGViewport,
] = classesByTheirDeprecatedNames;
export const constructorsByTheirDeprecatedNames: [
  typeof VolumeViewport3D,
  typeof VideoViewport,
  typeof WSIViewport,
  typeof ECGViewport,
] = [
  GenericVolumeViewport3D,
  VideoGenericViewport,
  WSIGenericViewport,
  ECGGenericViewport,
];

/**
 * A `_NEXT` name of `Enums.ViewportType` has the plain string, so the type of
 * a viewport still compares with it, and a `_NEXT` name is a plain type.
 */
export const typesOfTheDeprecatedNames: boolean[] = [
  planar.type === Enums.ViewportType.PLANAR_NEXT,
  volume3D.type === Enums.ViewportType.VOLUME_3D_NEXT,
  video.type === Enums.ViewportType.VIDEO_NEXT,
  wholeSlide.type === Enums.ViewportType.WHOLE_SLIDE_NEXT,
  ecg.type === Enums.ViewportType.ECG_NEXT,
];
export const plainTypeOfADeprecatedName: Enums.ViewportType.PLANAR =
  Enums.ViewportType.PLANAR_NEXT;
export const deprecatedStringAsAType: Types.ViewportType = 'planarNext';

/** The members of the base class, read from the interface. */
export function membersOfTheInterface() {
  const viewState: object = generic.getViewState();
  const mode: Types.ViewportContentMode = generic.getCurrentMode();
  const reference: Types.ViewReference = generic.getViewReference();
  const referenceId: string = generic.getViewReferenceId();
  const viewable: boolean = generic.isReferenceViewable(reference, {
    withNavigation: true,
  });
  const world: Types.Point3 = generic.canvasToWorld([0, 0]);
  const canvas: Types.Point2 = generic.worldToCanvas(world);
  const displaySets: Array<{ displaySetId: string; options?: unknown }> =
    generic.getDisplaySets();
  const camera: Types.ICamera<unknown> = generic.getResolvedView()?.toICamera();
  const engine: Types.IRenderingEngine = generic.getRenderingEngine();
  const frameOfReferenceUID: string = generic.getFrameOfReferenceUID();
  const fidelity: Types.ViewportFidelityState = generic.getFidelityState();
  const element: HTMLDivElement = generic.element;
  const destroyed: boolean = generic.isDestroyed;
  const didReset: boolean = generic.resetViewState();

  generic.setViewState({});
  generic.updateViewState(() => ({}));
  generic.setViewReference(reference);
  generic.setDisplaySetPresentation(displaySetId, {});
  generic.removeData(displaySetId);
  generic.resize();
  generic.render();

  return [
    viewState,
    mode,
    referenceId,
    viewable,
    canvas,
    displaySets,
    camera,
    engine,
    frameOfReferenceUID,
    fidelity,
    element,
    destroyed,
    didReset,
    generic.getDisplaySetPresentation(displaySetId),
    generic.setDisplaySets({ displaySetId }),
    generic.id,
    generic.type,
    generic.renderingEngineId,
    generic.viewportStatus,
    generic.defaultOptions,
    generic.getAspectRatio(),
    generic.canReportFidelity(),
  ];
}

/** The typed state of each family, read from its class. */
export function membersOfTheClasses() {
  const planarViewState: Types.Point3 | undefined =
    planar.getViewState().anchorWorld;
  const { imageData, voxelManager } = planar.getImageData();
  const bounds = imageData.getBounds();
  const value = voxelManager?.getAtIJKPoint(
    utilities.transformWorldToIndex(imageData, point)
  );
  const dimensions: Types.Point3 = planar.getImageData(displaySetId).dimensions;
  const camera: PlanarResolvedICamera = planar.getResolvedView()?.toICamera();
  const cameraOfAnyFamily: Types.ICamera<unknown> = camera;
  const { focalPoint, viewPlaneNormal, viewUp } = camera;
  const scaleOfCamera: number | Types.Point2 = camera.scale;
  const camera3D: Types.ICamera = volume3D.getResolvedView()?.toICamera();

  return [
    planarViewState,
    bounds,
    value,
    dimensions,
    cameraOfAnyFamily,
    focalPoint,
    viewPlaneNormal,
    viewUp,
    scaleOfCamera,
    camera3D,
    planar.setDisplaySets({ displaySetId, options: { orientation } }),
    video.getImageData().dimensions,
    wholeSlide.getImageData().dimensions,
    ecg.getImageData().dimensions,
  ];
}

/** The functions of `utilities` that the guide calls with a next viewport. */
export function functionsOfTheGuide() {
  utilities.scroll(planar, { delta: 1 });
  utilities.scroll(video, { delta: 1 });
  utilities.scroll(ecg, { delta: 1 });
  utilities.scroll(generic, { delta: 1 });
  utilities.scroll(viewport, { delta: 1 });
  utilities.scroll(enabledElement.viewport, { delta: 1 });

  return [
    utilities.isInAcquisitionPlane(planar),
    utilities.isInAcquisitionPlane(video),
    utilities.isInAcquisitionPlane(wholeSlide),
    utilities.isInAcquisitionPlane(generic),
    utilities.isInAcquisitionPlane(viewport),
    utilities.getSlicesClippingPlanes(planar),
    utilities.getSlicesClippingPlanes(generic),
    utilities.getSlicesClippingPlanes(viewport),
    utilities.getCurrentVolumeViewportSlice(planar),
    utilities.getViewportModality(planar),
    utilities.getViewportModality(generic),
    utilities.getViewportModality(viewport),
    utilities.getViewportImageIds(planar),
    utilities.getViewportImageIds(generic),
    utilities.getViewportImageIds(viewport),
    utilities.getClosestStackImageIndexForPoint(point, planar),
    utilities.getScalingDescriptor(planar),
    utilities.getScalingDescriptor(generic),
    utilities.resolveGenericViewportVolumeId(generic),
    utilities.getViewportImageCornersInWorld(planar),
    utilities.calculateViewportsSpatialRegistration(planar, planar),
    utilities.getTargetVolumeAndSpacingInNormalDir(
      planar,
      planar.getResolvedView()?.toICamera()
    ),
    utilities.getViewportContentMode(planar),
    utilities.viewportIsInStackMode(planar),
    utilities.viewportIsInVolumeMode(planar),
  ];
}

/**
 * `init` takes a configuration with only the keys that the application sets,
 * as the guide passes `rendering.planar.renderBackend`.
 */
export function initWithOneKey() {
  return init({ rendering: { planar: { renderBackend: 'cpu' } } });
}

/** The fidelity indicator takes a viewport of any family. */
export function fidelityIndicator() {
  maybeAttachFidelityIndicator(planar);
  detachFidelityIndicator(generic);

  return [
    attachFidelityIndicator(volume3D),
    attachFidelityIndicator(viewport),
    canReportFidelity(video),
    canReportFidelity(generic),
  ];
}

/** The selector of `viewportProjection` takes the keys of each family. */
export function selectorsOfTheProjection() {
  const planarScale: Types.Point2 | undefined =
    viewportProjection.getPresentation(planar, {
      selector: { scale: true, zoom: true, pan: true },
    })?.scale;
  const planarByKind: Types.Point2 | undefined =
    viewportProjection.getPresentation(generic, {
      kind: 'planar',
      selector: { scale: true },
    })?.scale;
  const zoom: number | undefined = viewportProjection.getPresentation(
    volume3D,
    { selector: { zoom: true, pan: true, rotation: true } }
  )?.zoom;
  const zoomed = viewportProjection.withPresentation(planar, { zoom: 2 });

  if (zoomed) {
    planar.setViewState(zoomed);
  }

  return [
    planarScale,
    planarByKind,
    zoom,
    viewportProjection.getPresentation(video, { selector: { zoom: true } }),
    viewportProjection.getPresentation(wholeSlide, { selector: { pan: true } }),
    viewportProjection.getPresentation(ecg, { selector: { zoom: true } }),
  ];
}

/**
 * A viewport of any family narrows to the members of a family with a guard,
 * or comes from the rendering engine typed with its class.
 */
export function guards() {
  if (utilities.viewportSupportsDisplaySetPresentation(viewport)) {
    viewport.getDefaultVOIRange(viewport.getSourceDataId());
  }

  if (utilities.viewportSupportsImageSlices(enabledElement.viewport)) {
    enabledElement.viewport.getCurrentImageIdIndex();
  }

  if (utilities.viewportSupportsImageSlices(planar)) {
    planar.getCurrentImageIdIndex();
  }

  if (utilities.isGenericViewport(viewport)) {
    viewport.setViewState({});
  }

  const planarOfTheEngine: PlanarViewport =
    renderingEngine.getViewport<PlanarViewport>(viewportId);

  planarOfTheEngine.setViewState({ rotation: 90 });
  enabledElement.viewport.setDisplaySetPresentation(displaySetId, {});

  return utilities.getViewportContentMode(enabledElement.viewport) === 'stack';
}
