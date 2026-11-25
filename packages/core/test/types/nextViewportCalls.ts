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
  ECGMountOptions,
  ECGViewport,
  PlanarMountOptions,
  PlanarResolvedICamera,
  PlanarViewport,
  RenderingEngine,
  Types,
  VideoMountOptions,
  VideoViewport,
  Volume3DMountOptions,
  VolumeViewport3D,
  WSIMountOptions,
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

  const planarMount: PlanarMountOptions = {
    mode: 'auto',
    role: 'source',
    orientation,
    initialImageIdIndex: 3,
    renderBackend: Enums.RenderBackends.CPU,
    sliceFirst: true,
    volumeId: 'cornerstoneStreamingImageVolume:ct',
    appearance: { voiRange: { lower: 0, upper: 100 }, slabThickness: 10 },
  };
  const volume3DMount: Volume3DMountOptions = {
    role: 'source',
    volumeId: 'cornerstoneStreamingImageVolume:ct',
    appearance: { opacity: 0.5 },
  };

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
    planar.setDisplaySets({
      displaySetId,
      options: {
        mode: 'volume',
        volumeId: 'cornerstoneStreamingImageVolume:ct',
      },
    }),
    planar.addDisplaySet(displaySetId, { mode: 'stack', role: 'overlay' }),
    planar.setDisplaySets({ displaySetId, options: planarMount }),
    planar.getDisplaySets()[0].options.mode,
    planar.getDisplaySets()[0].options.volumeId,
    volume3D.setDisplaySets({
      displaySetId,
      options: { volumeId: 'cornerstoneStreamingImageVolume:ct' },
    }),
    volume3D.setDisplaySets({ displaySetId, options: volume3DMount }),
    video.setDisplaySets({
      displaySetId,
      options: { frameNumber: 2, appearance: { playbackRate: 2 } },
    }),
    ecg.setDisplaySets({
      displaySetId,
      options: { appearance: { lineWidth: 2 } },
    }),
    wholeSlide.setDisplaySets({
      displaySetId,
      options: { appearance: { opacity: 0.5 } },
    }),
    video.getImageData().dimensions,
    wholeSlide.getImageData().dimensions,
    ecg.getImageData().dimensions,
  ];
}

/**
 * The display sets of a viewport, with the options of their mounts, mount
 * another viewport of the same family as they are.
 */
export function copiesOfTheMountsOfEachFamily() {
  const volume3DOptions: Volume3DMountOptions =
    volume3D.getDisplaySets()[0].options;
  const videoOptions: VideoMountOptions = video.getDisplaySets()[0].options;
  const ecgOptions: ECGMountOptions = ecg.getDisplaySets()[0].options;
  const wholeSlideOptions: WSIMountOptions =
    wholeSlide.getDisplaySets()[0].options;

  return [
    planar.setDisplaySets(...planar.getDisplaySets()),
    volume3D.setDisplaySets(...volume3D.getDisplaySets()),
    video.setDisplaySets(...video.getDisplaySets()),
    ecg.setDisplaySets(...ecg.getDisplaySets()),
    wholeSlide.setDisplaySets(...wholeSlide.getDisplaySets()),
    volume3DOptions.volumeId,
    videoOptions.frameNumber,
    ecgOptions.multiplexGroupIndex,
    wholeSlideOptions.role,
    video.setDisplaySets({ displaySetId, options: { role: 'source' } }),
    ecg.setDisplaySets({
      displaySetId,
      options: { role: 'source', multiplexGroupIndex: 1 },
    }),
    wholeSlide.setDisplaySets({ displaySetId, options: { role: 'source' } }),
  ];
}

/** The functions of `utilities` that the guide calls with a next viewport. */
export function functionsOfTheGuide() {
  utilities.scroll(planar, { delta: 1 });
  utilities.scroll(video, { delta: 1 });
  utilities.scroll(ecg, { delta: 1 });
  utilities.scroll(viewport, { delta: 1 });
  utilities.scroll(enabledElement.viewport, { delta: 1 });
  planar.scroll(-1, { loop: true, scrollSlabs: true, volumeId: displaySetId });
  video.scroll(1, true, true);

  const outOfBounds: Types.EventTypes.ScrollOutOfBoundsEventDetail = {
    viewportId,
    renderingEngineId: renderingEngine.id,
    displaySetId,
    sliceIndex: 0,
    numberOfSlices: 1,
    delta: -1,
    direction: -1,
  };

  return [
    outOfBounds,
    Enums.Events.SCROLL_OUT_OF_BOUNDS,
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
    utilities.getDefaultVolumeId(planar.getImageIds()),
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
 * The framing methods of each family take and give the framing of that
 * family, with its own selector.
 */
export function framingOfEachFamily() {
  const planarFraming = planar.getViewFraming({
    scale: true,
    scaleMode: true,
    fitScale: true,
  });
  const scale: Types.Point2 | undefined = planarFraming?.scale;
  const fitScale: Types.Point2 | undefined = planarFraming?.fitScale;
  const camera: Types.Point3 | undefined =
    volume3D.getViewFraming()?.camera.viewPlaneNormal;
  const anyZoom: number | undefined = viewport.getViewFraming({
    zoom: true,
  })?.zoom;

  planar.setViewFraming({ scale: [2, 1], scaleMode: 'fitAspect' });
  planar.setViewFraming(planarFraming);
  volume3D.setViewFraming(volume3D.getViewFraming());
  viewport.setViewFraming({ zoom: 2 });
  planar.setViewState({ displayArea: { imageArea: [0.5, 0.5] } });

  return [scale, fitScale, camera, anyZoom];
}

/**
 * Every family's framing has its pan in world units, and a patch and a
 * selector take it.
 */
export function framingWorldPanOfEachFamily() {
  const planarPan: Types.Point2 | undefined = planar.getViewFraming({
    worldPan: true,
  })?.worldPan;
  const volume3DPan: Types.Point2 | undefined =
    volume3D.getViewFraming()?.worldPan;
  const anyPan: Types.Point2 | undefined = viewport.getViewFraming({
    worldPan: true,
  })?.worldPan;

  planar.setViewFraming({ worldPan: [4, 2] });
  volume3D.setViewFraming({ worldPan: [4, 2] });
  viewport.setViewFraming({ worldPan: [4, 2], zoom: 2 });

  return [planarPan, volume3DPan, anyPan];
}

/**
 * A framing and its selector have no aspect ratio: the stretch of a planar
 * view is the scale pair of its framing.
 */
export function framingWithoutAspectRatio() {
  // @ts-expect-error
  planar.setViewFraming({ aspectRatio: [2, 1] });
  // @ts-expect-error
  viewport.getViewFraming({ aspectRatio: true });

  const framing: Types.ViewFraming = {
    zoom: 2,
    // @ts-expect-error
    aspectRatio: [2, 1],
  };
  const selector: Types.ViewFramingSelector = {
    zoom: true,
    // @ts-expect-error
    aspectRatio: true,
  };

  return [framing, selector];
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

/** The queries of a planar and a 3D viewport, as the guide gives them. */
export function queriesOfTheViewports() {
  const volumeIds: string[] = planar.getVolumeIds();
  const withLabelmaps: string[] = volume3D.getVolumeIds({
    includeSegmentations: true,
  });
  const range: [number, number] | undefined =
    planar.getScalarRange(displaySetId);
  const range3D: [number, number] | undefined = volume3D.getScalarRange();
  const ofVolume: string | undefined = planar.getDisplaySetIdForVolumeId(
    volumeIds[0]
  );
  const ofVolume3D: string | undefined =
    volume3D.getDisplaySetIdForVolumeId('volume');
  const inAcquisitionPlane: boolean = planar.isInAcquisitionPlane();
  const surfaceMode: Types.ViewportContentMode = 'geometry3d';

  return [
    withLabelmaps,
    range,
    range3D,
    ofVolume,
    ofVolume3D,
    inAcquisitionPlane,
    surfaceMode,
  ];
}
