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
  maybeAttachFidelityIndicator,
  utilities,
  viewportProjection,
} from '../../src';
import type {
  ECGGenericViewport,
  Enums,
  GenericVolumeViewport3D,
  PlanarResolvedICamera,
  PlanarViewport,
  RenderingEngine,
  Types,
  VideoGenericViewport,
  WSIGenericViewport,
} from '../../src';

declare const planar: PlanarViewport;
declare const volume3D: GenericVolumeViewport3D;
declare const video: VideoGenericViewport;
declare const wholeSlide: WSIGenericViewport;
declare const ecg: ECGGenericViewport;
declare const generic: Types.IGenericViewport;
declare const legacy: Types.IViewport;
declare const legacyStack: Types.IStackViewport;
declare const legacyVolume: Types.IVolumeViewport;
declare const legacyOrNext: Types.IViewport | Types.IGenericViewport;
declare const renderingEngine: RenderingEngine;
declare const viewportId: string;
declare const displaySetId: string;
declare const point: Types.Point3;
declare const orientation: Enums.OrientationAxis;

/** The class of every next family is a `Types.IGenericViewport`. */
export const nextViewports: Types.IGenericViewport[] = [
  planar,
  volume3D,
  video,
  wholeSlide,
  ecg,
  generic,
  renderingEngine.getViewport<Types.IGenericViewport>(viewportId),
];

/** A next viewport and a legacy viewport both go where the library takes one. */
export const viewportsOfTheLibrary: Array<
  Types.IViewport | Types.IGenericViewport
> = [planar, volume3D, video, wholeSlide, ecg, generic, legacy];

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
  utilities.scroll(legacy, { delta: 1 });

  return [
    utilities.isInAcquisitionPlane(planar),
    utilities.isInAcquisitionPlane(video),
    utilities.isInAcquisitionPlane(wholeSlide),
    utilities.isInAcquisitionPlane(generic),
    utilities.isInAcquisitionPlane(legacy),
    utilities.getSlicesClippingPlanes(planar),
    utilities.getSlicesClippingPlanes(generic),
    utilities.getSlicesClippingPlanes(legacy),
    utilities.getCurrentVolumeViewportSlice(planar),
    utilities.getCurrentVolumeViewportSlice(legacyVolume),
    utilities.getViewportModality(planar),
    utilities.getViewportModality(generic),
    utilities.getViewportModality(legacy),
    utilities.getViewportImageIds(planar),
    utilities.getViewportImageIds(generic),
    utilities.getViewportImageIds(legacy),
    utilities.getClosestStackImageIndexForPoint(point, planar),
    utilities.getClosestStackImageIndexForPoint(point, legacyStack),
    utilities.getScalingDescriptor(planar),
    utilities.getScalingDescriptor(generic),
    utilities.resolveGenericViewportVolumeId(generic),
    utilities.getViewportImageCornersInWorld(planar),
    utilities.calculateViewportsSpatialRegistration(planar, legacyStack),
    utilities.getTargetVolumeAndSpacingInNormalDir(
      planar,
      planar.getResolvedView()?.toICamera()
    ),
    utilities.getViewportContentMode(planar),
    utilities.viewportIsInStackMode(planar),
    utilities.viewportIsInVolumeMode(planar),
  ];
}

/** The fidelity indicator takes a viewport of any family. */
export function fidelityIndicator() {
  maybeAttachFidelityIndicator(planar);
  detachFidelityIndicator(generic);

  return [
    attachFidelityIndicator(volume3D),
    attachFidelityIndicator(legacy),
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

/** The guard narrows a value of the union and a value typed `IViewport`. */
export function guards() {
  if (utilities.isGenericViewport(legacyOrNext)) {
    const next: Types.IGenericViewport = legacyOrNext;

    next.setViewState({});
  } else {
    const old: Types.IViewport = legacyOrNext;

    old.getCamera();
  }

  if (utilities.isGenericViewport(legacy)) {
    legacy.setViewState({});
    legacy.setDisplaySetPresentation(displaySetId, {});
    legacy.getCamera();
  } else {
    legacy.getCamera();
  }

  if (utilities.viewportSupportsDisplaySetPresentation(legacyOrNext)) {
    legacyOrNext.getDefaultVOIRange(legacyOrNext.getSourceDataId());
  }

  if (utilities.viewportSupportsImageSlices(planar)) {
    planar.getCurrentImageIdIndex();
  }
}

/**
 * The guard splits a union of a legacy type and the class of a next family:
 * the members of the class on one side, the legacy members on the other.
 */
export function guardsOnClassUnions(
  legacyOrPlanar: Types.IViewport | PlanarViewport,
  legacyOr3D: Types.IVolumeViewport | GenericVolumeViewport3D,
  legacyOrVideo: Types.IVideoViewport | VideoGenericViewport,
  legacyOrWholeSlide: Types.IWSIViewport | WSIGenericViewport,
  legacyOrECG: Types.IECGViewport | ECGGenericViewport
) {
  if (utilities.isGenericViewport(legacyOrPlanar)) {
    const next: PlanarViewport = legacyOrPlanar;

    next.setViewState({ rotation: 90 });
  } else {
    const old: Types.IViewport = legacyOrPlanar;

    old.getCamera();
  }

  if (utilities.isGenericViewport(legacyOr3D)) {
    const next: GenericVolumeViewport3D = legacyOr3D;

    next.getRenderer();
  } else {
    legacyOr3D.getSlabThickness();
  }

  if (utilities.isGenericViewport(legacyOrVideo)) {
    const next: VideoGenericViewport = legacyOrVideo;

    next.play();
  } else {
    legacyOrVideo.getCamera();
  }

  if (utilities.isGenericViewport(legacyOrWholeSlide)) {
    const next: WSIGenericViewport = legacyOrWholeSlide;

    next.getView();
  } else {
    legacyOrWholeSlide.getCamera();
  }

  if (utilities.isGenericViewport(legacyOrECG)) {
    const next: ECGGenericViewport = legacyOrECG;

    next.getWaveformData();
  } else {
    legacyOrECG.getCamera();
  }
}
