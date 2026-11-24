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
  Enums,
  init,
  maybeAttachFidelityIndicator,
  utilities,
  viewportProjection,
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
  viewport,
  enabledElement.viewport,
  renderingEngine.getViewport(viewportId),
  renderingEngine.getViewport<Types.IViewport>(viewportId),
  ...renderingEngine.getViewports(),
];

/** The members of the base class, read from the interface. */
export function membersOfTheInterface() {
  const viewState: object = viewport.getViewState();
  const mode: Types.ViewportContentMode = viewport.getCurrentMode();
  const reference: Types.ViewReference = viewport.getViewReference();
  const referenceId: string = viewport.getViewReferenceId();
  const viewable: boolean = viewport.isReferenceViewable(reference, {
    withNavigation: true,
  });
  const world: Types.Point3 = viewport.canvasToWorld([0, 0]);
  const canvas: Types.Point2 = viewport.worldToCanvas(world);
  const displaySets: Array<{ displaySetId: string; options?: unknown }> =
    viewport.getDisplaySets();
  const camera: Types.ICamera<unknown> = viewport
    .getResolvedView()
    ?.toICamera();
  const engine: Types.IRenderingEngine = viewport.getRenderingEngine();
  const frameOfReferenceUID: string = viewport.getFrameOfReferenceUID();
  const fidelity: Types.ViewportFidelityState = viewport.getFidelityState();
  const element: HTMLDivElement = viewport.element;
  const destroyed: boolean = viewport.isDestroyed;
  const didReset: boolean = viewport.resetViewState();

  viewport.setViewState({});
  viewport.updateViewState(() => ({}));
  viewport.setViewReference(reference);
  viewport.setDisplaySetAppearance(displaySetId, {});
  viewport.removeDisplaySet(displaySetId);
  viewport.resize();
  viewport.render();

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
    viewport.getDisplaySetAppearance(displaySetId),
    viewport.setDisplaySets({ displaySetId }),
    viewport.id,
    viewport.type,
    viewport.renderingEngineId,
    viewport.viewportStatus,
    viewport.defaultOptions,
    viewport.getAspectRatio(),
    viewport.canReportFidelity(),
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
  utilities.scroll(viewport, { delta: 1 });
  utilities.scroll(enabledElement.viewport, { delta: 1 });

  return [
    utilities.isInAcquisitionPlane(planar),
    utilities.isInAcquisitionPlane(video),
    utilities.isInAcquisitionPlane(wholeSlide),
    utilities.isInAcquisitionPlane(viewport),
    utilities.getSlicesClippingPlanes(planar),
    utilities.getSlicesClippingPlanes(viewport),
    utilities.getCurrentVolumeViewportSlice(planar),
    utilities.getViewportModality(planar),
    utilities.getViewportModality(viewport),
    utilities.getViewportImageIds(planar),
    utilities.getViewportImageIds(viewport),
    utilities.getClosestStackImageIndexForPoint(point, planar),
    utilities.getScalingDescriptor(planar),
    utilities.getScalingDescriptor(viewport),
    utilities.resolveViewportVolumeId(viewport),
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
  detachFidelityIndicator(viewport);

  return [
    attachFidelityIndicator(volume3D),
    attachFidelityIndicator(viewport),
    canReportFidelity(video),
    canReportFidelity(viewport),
  ];
}

/** The selector of `viewportProjection` takes the keys of each family. */
export function selectorsOfTheProjection() {
  const planarScale: Types.Point2 | undefined = viewportProjection.getFraming(
    planar,
    {
      selector: { scale: true, zoom: true, pan: true },
    }
  )?.scale;
  const planarByKind: Types.Point2 | undefined = viewportProjection.getFraming(
    viewport,
    {
      kind: 'planar',
      selector: { scale: true },
    }
  )?.scale;
  const zoom: number | undefined = viewportProjection.getFraming(volume3D, {
    selector: { zoom: true, pan: true, rotation: true },
  })?.zoom;
  const zoomed = viewportProjection.withFraming(planar, { zoom: 2 });

  if (zoomed) {
    planar.setViewState(zoomed);
  }

  return [
    planarScale,
    planarByKind,
    zoom,
    viewportProjection.getFraming(video, { selector: { zoom: true } }),
    viewportProjection.getFraming(wholeSlide, { selector: { pan: true } }),
    viewportProjection.getFraming(ecg, { selector: { zoom: true } }),
  ];
}

/**
 * A viewport of any family narrows to the members of a family with a guard,
 * or comes from the rendering engine typed with its class.
 */
export function guards() {
  if (utilities.viewportSupportsDisplaySetAppearance(viewport)) {
    viewport.getDefaultVOIRange(viewport.getSourceDisplaySetId());
  }

  if (utilities.viewportSupportsImageSlices(enabledElement.viewport)) {
    enabledElement.viewport.getCurrentImageIdIndex();
  }

  if (utilities.viewportSupportsImageSlices(planar)) {
    planar.getCurrentImageIdIndex();
  }

  viewport.setViewState({});

  const planarOfTheEngine: PlanarViewport =
    renderingEngine.getViewport<PlanarViewport>(viewportId);

  planarOfTheEngine.setViewState({ rotation: 90 });
  enabledElement.viewport.setDisplaySetAppearance(displaySetId, {});

  return utilities.getViewportContentMode(enabledElement.viewport) === 'stack';
}
