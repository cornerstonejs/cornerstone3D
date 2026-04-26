/**
 * planarRenderCamera — Converts the semantic PlanarViewState model into a
 * renderer-ready ICamera, and applies it to VTK renderers.
 *
 * This is the final stage of the three-tier camera pipeline:
 *   PlanarViewState (user model) -> PlanarSliceBasis (geometric basis) -> ICamera (render camera)
 *
 * Key concepts:
 *   - `derivePlanarPresentation`: extracts canvas-space pan/zoom/rotation from
 *     a sliceBasis + PlanarViewState pair. Used by CPU render paths that apply
 *     presentation via their own transform pipeline.
 *   - `resolvePlanarICamera`: produces a complete ICamera (focalPoint,
 *     position, viewUp, parallelScale) ready for a VTK renderer. Internally
 *     calls `derivePlanarPresentation` then converts the canvas-space pan back
 *     to a world-space focal-point offset.
 *   - `applyPlanarICameraToRenderer`: pushes the resolved ICamera onto
 *     a vtkRenderer's active camera.
 *
 * Volume clipping utilities (`setPlanarVolumeCameraClippingRange`,
 * `updatePlanarVolumeClippingPlanes`) are co-located here because they depend
 * on the resolved camera's focalPoint and viewPlaneNormal.
 */
import { mat4, vec2, vec3 } from 'gl-matrix';
import type vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import vtkPlaneFactory from '@kitware/vtk.js/Common/DataModel/Plane';
import type vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import type vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import { RENDERING_DEFAULTS } from '../../../constants';
import type { ICamera, Point2, Point3 } from '../../../types';
import {
  applyPlanarViewFlip,
  normalizePlanarRotation,
  rotatePlanarViewUp,
} from './planarViewPresentation';
import { getSafeCanvasDimension, normalizePoint3 } from './planarMath';
import type {
  PlanarViewState,
  PlanarResolvedICamera,
} from './PlanarViewportTypes';
import type { PlanarSliceBasis } from './planarSliceBasis';
import {
  MIN_PLANAR_SCALE,
  normalizePlanarScale,
  normalizePlanarScaleMode,
  type PlanarScale,
} from './planarCameraScale';

/**
 * Canvas-space presentation values derived from a semantic camera and a
 * section basis. CPU render paths consume these directly; VTK paths use
 * them as an intermediate step inside `resolvePlanarICamera`.
 */
export interface DerivedPlanarPresentation {
  pan: Point2;
  zoom: number;
  scale: Point2;
  rotation: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
}

const MIN_DISPLAY_AREA_VALUE = 1e-3;
const MIN_SCALE_RATIO = 1e-6;

function getSliceCanvasDimensionsAtFit(args: {
  sliceBasis: PlanarSliceBasis;
  canvasWidth: number;
  canvasHeight: number;
}): Point2 {
  const { canvasHeight, canvasWidth, sliceBasis } = args;
  const safeCanvasWidth = getSafeCanvasDimension(canvasWidth);
  const safeCanvasHeight = getSafeCanvasDimension(canvasHeight);
  const safeFitParallelScale = Math.max(
    sliceBasis.fitParallelScale,
    MIN_DISPLAY_AREA_VALUE
  );
  const worldHeightAtFit = safeFitParallelScale * 2;
  const worldWidthAtFit =
    worldHeightAtFit * (safeCanvasWidth / safeCanvasHeight);

  return [
    (Math.max(sliceBasis.sliceWidthWorld, MIN_DISPLAY_AREA_VALUE) /
      Math.max(worldWidthAtFit, MIN_DISPLAY_AREA_VALUE)) *
      safeCanvasWidth,
    (Math.max(sliceBasis.sliceHeightWorld, MIN_DISPLAY_AREA_VALUE) /
      Math.max(worldHeightAtFit, MIN_DISPLAY_AREA_VALUE)) *
      safeCanvasHeight,
  ];
}

function deriveDisplayAreaPresentation(args: {
  sliceBasis: PlanarSliceBasis;
  camera?: PlanarViewState;
  canvasWidth: number;
  canvasHeight: number;
  scale: PlanarScale;
}): Pick<DerivedPlanarPresentation, 'pan' | 'zoom' | 'scale'> | undefined {
  const { canvasHeight, canvasWidth, camera, scale, sliceBasis } = args;
  const displayArea = camera?.displayArea;

  if (!displayArea) {
    return;
  }

  const safeCanvasWidth = getSafeCanvasDimension(canvasWidth);
  const safeCanvasHeight = getSafeCanvasDimension(canvasHeight);
  const [imageWidthAtFit, imageHeightAtFit] = getSliceCanvasDimensionsAtFit({
    canvasHeight,
    canvasWidth,
    sliceBasis,
  });
  let resolvedScale = [...scale] as Point2;

  if (displayArea.type === 'SCALE' && displayArea.scale !== undefined) {
    resolvedScale = normalizePlanarScale(displayArea.scale);
  } else if (displayArea.imageArea) {
    const [areaX, areaY] = displayArea.imageArea;
    const safeAreaX = Math.max(Math.abs(areaX), MIN_DISPLAY_AREA_VALUE);
    const safeAreaY = Math.max(Math.abs(areaY), MIN_DISPLAY_AREA_VALUE);
    const fitScaleX =
      safeCanvasWidth /
      Math.max(safeAreaX * imageWidthAtFit, MIN_DISPLAY_AREA_VALUE);
    const fitScaleY =
      safeCanvasHeight /
      Math.max(safeAreaY * imageHeightAtFit, MIN_DISPLAY_AREA_VALUE);
    const scaleMode = normalizePlanarScaleMode(
      displayArea.scaleMode ?? camera?.scaleMode
    );

    if (scaleMode === 'absolute') {
      resolvedScale = [fitScaleX * scale[0], fitScaleY * scale[1]];
    } else {
      const uniformFitScale =
        scaleMode === 'fitWidth'
          ? fitScaleX
          : scaleMode === 'fitHeight'
            ? fitScaleY
            : Math.min(fitScaleX, fitScaleY);

      resolvedScale = [uniformFitScale * scale[0], uniformFitScale * scale[1]];
    }
  }

  let pan: Point2 = [0, 0];

  if (displayArea.imageCanvasPoint) {
    const { imagePoint, canvasPoint = imagePoint || [0.5, 0.5] } =
      displayArea.imageCanvasPoint;
    const [canvasX, canvasY] = canvasPoint;
    const [imageX, imageY] = imagePoint || canvasPoint;

    pan = [
      resolvedScale[0] * imageWidthAtFit * (0.5 - imageX) +
        safeCanvasWidth * (canvasX - 0.5),
      resolvedScale[1] * imageHeightAtFit * (0.5 - imageY) +
        safeCanvasHeight * (canvasY - 0.5),
    ];
  }

  return {
    pan,
    scale: resolvedScale,
    zoom: resolvedScale[1],
  };
}

/**
 * Projects a 3-D anchor point onto the current viewing plane so that
 * zoom-to-point works correctly when the anchor was placed on a different
 * slice. Without this projection, an anchor from slice N would shift the
 * focal point off-plane when viewed from slice M.
 *
 * @param anchorWorld - The original anchor in world coordinates.
 * @param planePoint - Any point on the target plane (typically sliceCenterWorld).
 * @param planeNormal - The target plane's normal vector.
 * @returns The anchor point projected onto the target plane.
 */
export function projectAnchorWorldToCurrentPlane(
  anchorWorld: Point3,
  planePoint: Point3,
  planeNormal: Point3
): Point3 {
  const normalizedPlaneNormal = normalizePoint3(planeNormal, [0, 0, 1]);
  const delta = vec3.subtract(
    vec3.create(),
    anchorWorld as unknown as vec3,
    planePoint as unknown as vec3
  );
  const distance = vec3.dot(delta, normalizedPlaneNormal as unknown as vec3);

  return vec3.scaleAndAdd(
    vec3.create(),
    anchorWorld as unknown as vec3,
    normalizedPlaneNormal as unknown as vec3,
    -distance
  ) as Point3;
}

/**
 * Derives canvas-space presentation values (pan, zoom, rotation) from a
 * semantic PlanarViewState and a PlanarSliceBasis.
 *
 * Pan is computed in two parts:
 *   1. `panFromAnchorWorld` — the offset caused by the anchor point being
 *      away from sliceCenterWorld, projected into canvas pixels.
 *   2. `panFromAnchorCanvas` — the offset caused by the anchor being placed
 *      at a non-center canvas location (e.g. zoom-to-cursor).
 *
 * @param args.sliceBasis - The geometric basis for the current slice.
 * @param args.camera - The semantic camera (may be undefined for defaults).
 * @param args.canvasWidth - Current canvas width in CSS pixels.
 * @param args.canvasHeight - Current canvas height in CSS pixels.
 * @returns Derived pan (pixels), zoom (scale factor), and rotation (degrees).
 */
export function derivePlanarPresentation(args: {
  sliceBasis: PlanarSliceBasis;
  camera?: PlanarViewState;
  canvasWidth: number;
  canvasHeight: number;
}): DerivedPlanarPresentation {
  const { sliceBasis, camera, canvasHeight, canvasWidth } = args;
  const scale = normalizePlanarScale(camera?.scale);
  const rotation = normalizePlanarRotation(camera?.rotation ?? 0);
  const anchorCanvas = vec2.clone(
    (camera?.anchorCanvas ?? [0.5, 0.5]) as unknown as vec2
  ) as Point2;
  const safeCanvasWidth = getSafeCanvasDimension(canvasWidth);
  const safeCanvasHeight = getSafeCanvasDimension(canvasHeight);
  const viewPlaneNormal = normalizePoint3(
    sliceBasis.viewPlaneNormal,
    [0, 0, 1]
  );
  const rotatedViewUp = normalizePoint3(
    rotatePlanarViewUp({
      rotation,
      viewPlaneNormal,
      viewUp: sliceBasis.viewUp,
    }) as Point3,
    [0, -1, 0]
  );
  const { viewPlaneNormal: flippedViewPlaneNormal, viewUp: flippedViewUp } =
    applyPlanarViewFlip({
      flipHorizontal: camera?.flipHorizontal,
      flipVertical: camera?.flipVertical,
      viewPlaneNormal,
      viewUp: rotatedViewUp,
    });
  let right = vec3.cross(
    vec3.create(),
    flippedViewUp as unknown as vec3,
    flippedViewPlaneNormal as unknown as vec3
  ) as Point3;

  if (!vec3.length(right as unknown as vec3)) {
    right = [1, 0, 0];
  } else {
    right = vec3.normalize(vec3.create(), right as unknown as vec3) as Point3;
  }

  // Project the anchor point onto the current slice plane so that an anchor
  // placed on a different slice doesn't shift the focal point off-plane.
  const effectiveAnchorWorld = camera?.anchorWorld
    ? projectAnchorWorldToCurrentPlane(
        camera.anchorWorld,
        sliceBasis.sliceCenterWorld,
        viewPlaneNormal
      )
    : sliceBasis.sliceCenterWorld;
  const [scaleX, scaleY] = scale;
  const parallelScale = sliceBasis.fitParallelScale / scaleY;
  const worldHeight = parallelScale * 2;
  const worldWidth = worldHeight * (safeCanvasWidth / safeCanvasHeight);
  const effectiveWorldWidth = worldWidth * (scaleY / scaleX);
  const displayAreaPresentation = deriveDisplayAreaPresentation({
    sliceBasis,
    camera,
    canvasWidth,
    canvasHeight,
    scale,
  });

  // Pan contribution from the anchor point being offset from sliceCenterWorld.
  // This converts the world-space displacement into canvas-pixel displacement.
  const deltaWorld = vec3.subtract(
    vec3.create(),
    sliceBasis.sliceCenterWorld as unknown as vec3,
    effectiveAnchorWorld as unknown as vec3
  );
  const panFromAnchorWorld: Point2 = [
    (vec3.dot(deltaWorld, right as unknown as vec3) * safeCanvasWidth) /
      effectiveWorldWidth,
    (-vec3.dot(deltaWorld, flippedViewUp as unknown as vec3) *
      safeCanvasHeight) /
      worldHeight,
  ];

  // Pan contribution from the anchor view position (normalized canvas coords).
  // An anchorCanvas of [0.5, 0.5] means centered, so this produces zero pan.
  const panFromAnchorCanvas: Point2 = [
    (anchorCanvas[0] - 0.5) * safeCanvasWidth,
    (anchorCanvas[1] - 0.5) * safeCanvasHeight,
  ];

  const pan: Point2 = displayAreaPresentation?.pan ?? [
    panFromAnchorWorld[0] + panFromAnchorCanvas[0],
    panFromAnchorWorld[1] + panFromAnchorCanvas[1],
  ];

  return {
    pan,
    flipHorizontal: camera?.flipHorizontal === true,
    flipVertical: camera?.flipVertical === true,
    scale: displayAreaPresentation?.scale ?? scale,
    zoom: displayAreaPresentation?.zoom ?? scale[1],
    rotation,
  };
}

/**
 * Converts canvas-space pan (pixels) back into a world-space offset vector
 * that can be subtracted from sliceCenterWorld to get the final focalPoint.
 *
 * This is the inverse of the pan->canvas mapping in `derivePlanarPresentation`.
 */
function getResolvedPanOffset(args: {
  sliceBasis: PlanarSliceBasis;
  canvasWidth: number;
  canvasHeight: number;
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  pan?: [number, number];
  rotation?: number;
  scale?: PlanarScale;
}) {
  const {
    sliceBasis,
    canvasWidth,
    canvasHeight,
    flipHorizontal,
    flipVertical,
    pan = [0, 0],
    rotation,
    scale = [1, 1],
  } = args;
  const viewPlaneNormal = normalizePoint3(sliceBasis.viewPlaneNormal);
  const rotatedViewUp = normalizePoint3(
    rotatePlanarViewUp({
      rotation,
      viewPlaneNormal,
      viewUp: sliceBasis.viewUp,
    }) as Point3
  );
  const { viewPlaneNormal: flippedViewPlaneNormal, viewUp: flippedViewUp } =
    applyPlanarViewFlip({
      flipHorizontal,
      flipVertical,
      viewPlaneNormal,
      viewUp: rotatedViewUp,
    });
  let right = vec3.cross(
    vec3.create(),
    flippedViewUp as unknown as vec3,
    flippedViewPlaneNormal as unknown as vec3
  );

  if (vec3.length(right) === 0) {
    right = vec3.fromValues(1, 0, 0);
  }

  right = vec3.normalize(vec3.create(), right);

  const [scaleX, scaleY] = normalizePlanarScale(scale);
  const [panX, panY] = pan;
  const parallelScale = sliceBasis.fitParallelScale / scaleY;
  const safeCanvasWidth = getSafeCanvasDimension(canvasWidth);
  const safeCanvasHeight = getSafeCanvasDimension(canvasHeight);
  const worldHeight = parallelScale * 2;
  const worldWidth = worldHeight * (safeCanvasWidth / safeCanvasHeight);
  const effectiveWorldWidth = worldWidth * (scaleY / scaleX);
  const deltaWorld = vec3.create();

  vec3.scaleAndAdd(
    deltaWorld,
    deltaWorld,
    right,
    (panX * effectiveWorldWidth) / safeCanvasWidth
  );
  vec3.scaleAndAdd(
    deltaWorld,
    deltaWorld,
    flippedViewUp as unknown as vec3,
    (-panY * worldHeight) / safeCanvasHeight
  );

  return {
    deltaWorld: deltaWorld as Point3,
    parallelScale,
    presentationScale: [scaleX, scaleY] as Point2,
    viewPlaneNormal: flippedViewPlaneNormal,
    viewUp: flippedViewUp,
  };
}

/**
 * Produces a complete ICamera from a PlanarSliceBasis and an optional
 * PlanarViewState. This is the main entry point for VTK-based render paths
 * that need to set up a vtkRenderer camera.
 *
 * The pipeline:
 *   1. `derivePlanarPresentation` extracts pan/zoom/rotation.
 *   2. `getResolvedPanOffset` converts canvas-space pan back to world offset.
 *   3. `focalPoint = sliceCenterWorld - worldOffset`.
 *   4. `position = focalPoint + viewPlaneNormal * cameraDistance`.
 *
 * @param args.sliceBasis - The geometric basis for the current slice.
 * @param args.camera - The semantic camera (may be undefined for defaults).
 * @param args.canvasWidth - Current canvas width in CSS pixels.
 * @param args.canvasHeight - Current canvas height in CSS pixels.
 * @returns A fully resolved ICamera ready for a VTK renderer.
 */
export function resolvePlanarICamera(args: {
  sliceBasis: PlanarSliceBasis;
  camera?: PlanarViewState;
  canvasWidth: number;
  canvasHeight: number;
}): PlanarResolvedICamera {
  const { sliceBasis, camera, canvasHeight, canvasWidth } = args;
  const presentation = derivePlanarPresentation({
    sliceBasis,
    camera,
    canvasWidth,
    canvasHeight,
  });
  const {
    deltaWorld,
    parallelScale,
    presentationScale,
    viewPlaneNormal,
    viewUp,
  } = getResolvedPanOffset({
    sliceBasis,
    canvasWidth,
    canvasHeight,
    flipHorizontal: presentation.flipHorizontal,
    flipVertical: presentation.flipVertical,
    pan: presentation.pan,
    rotation: presentation.rotation,
    scale: presentation.scale,
  });
  const focalPoint = vec3.subtract(
    vec3.create(),
    sliceBasis.sliceCenterWorld as unknown as vec3,
    deltaWorld as unknown as vec3
  ) as Point3;

  return {
    focalPoint,
    parallelProjection: true,
    parallelScale,
    presentationScale,
    scale: presentation.scale,
    scaleMode: normalizePlanarScaleMode(camera?.scaleMode),
    position: vec3.scaleAndAdd(
      vec3.create(),
      focalPoint as unknown as vec3,
      viewPlaneNormal as unknown as vec3,
      sliceBasis.cameraDistance
    ) as Point3,
    flipHorizontal: presentation.flipHorizontal,
    flipVertical: presentation.flipVertical,
    viewPlaneNormal,
    viewUp,
  };
}

/**
 * Pushes a resolved ICamera onto a vtkRenderer's active camera.
 * Returns the applied camera, or undefined if the camera was incomplete.
 *
 * @param args.renderer - The VTK renderer whose camera will be updated.
 * @param args.activeSourceICamera - The resolved ICamera to apply.
 * @returns The applied ICamera, or undefined if required fields were missing.
 */
export function applyPlanarICameraToRenderer(args: {
  renderer: vtkRenderer;
  activeSourceICamera?: PlanarResolvedICamera;
}): PlanarResolvedICamera | undefined {
  const { renderer, activeSourceICamera } = args;

  if (
    !activeSourceICamera?.focalPoint ||
    !activeSourceICamera.position ||
    !activeSourceICamera.viewPlaneNormal ||
    !activeSourceICamera.viewUp ||
    typeof activeSourceICamera.parallelScale !== 'number'
  ) {
    return;
  }

  const vtkCamera = renderer.getActiveCamera();

  vtkCamera.setParallelProjection(true);
  vtkCamera.setDirectionOfProjection(
    -activeSourceICamera.viewPlaneNormal[0],
    -activeSourceICamera.viewPlaneNormal[1],
    -activeSourceICamera.viewPlaneNormal[2]
  );
  vtkCamera.setParallelScale(activeSourceICamera.parallelScale);
  vtkCamera.setFocalPoint(...activeSourceICamera.focalPoint);
  vtkCamera.setPosition(...activeSourceICamera.position);
  vtkCamera.setViewUp(...activeSourceICamera.viewUp);

  return activeSourceICamera;
}

type PlanarScalableActor = {
  setUserMatrix?: (matrix: mat4) => void;
};

function getPlanarICameraRight(
  activeSourceICamera: Pick<PlanarResolvedICamera, 'viewPlaneNormal' | 'viewUp'>
): Point3 {
  const viewUp = normalizePoint3(activeSourceICamera.viewUp, [0, -1, 0]);
  const viewPlaneNormal = normalizePoint3(
    activeSourceICamera.viewPlaneNormal,
    [0, 0, 1]
  );
  const right = vec3.cross(
    vec3.create(),
    viewUp as unknown as vec3,
    viewPlaneNormal as unknown as vec3
  );

  if (vec3.length(right) < MIN_SCALE_RATIO) {
    return [1, 0, 0];
  }

  return vec3.normalize(vec3.create(), right) as Point3;
}

export function createPlanarPresentationScaleMatrix(
  activeSourceICamera?: Pick<
    PlanarResolvedICamera,
    'focalPoint' | 'presentationScale' | 'viewPlaneNormal' | 'viewUp'
  >
): mat4 {
  const matrix = mat4.create();

  if (
    !activeSourceICamera?.focalPoint ||
    !activeSourceICamera.viewPlaneNormal ||
    !activeSourceICamera.viewUp
  ) {
    return matrix;
  }

  const [scaleX, scaleY] = normalizePlanarScale(
    activeSourceICamera.presentationScale
  );
  const ratioX = Math.max(scaleX / scaleY, MIN_PLANAR_SCALE);

  if (Math.abs(ratioX - 1) < MIN_SCALE_RATIO) {
    return matrix;
  }

  const right = getPlanarICameraRight(activeSourceICamera);
  const ratioDelta = ratioX - 1;
  const [rx, ry, rz] = right;
  const linear = [
    1 + ratioDelta * rx * rx,
    ratioDelta * rx * ry,
    ratioDelta * rx * rz,
    ratioDelta * ry * rx,
    1 + ratioDelta * ry * ry,
    ratioDelta * ry * rz,
    ratioDelta * rz * rx,
    ratioDelta * rz * ry,
    1 + ratioDelta * rz * rz,
  ];
  const [cx, cy, cz] = activeSourceICamera.focalPoint;
  const transformedCenter: Point3 = [
    linear[0] * cx + linear[3] * cy + linear[6] * cz,
    linear[1] * cx + linear[4] * cy + linear[7] * cz,
    linear[2] * cx + linear[5] * cy + linear[8] * cz,
  ];

  matrix[0] = linear[0];
  matrix[1] = linear[1];
  matrix[2] = linear[2];
  matrix[4] = linear[3];
  matrix[5] = linear[4];
  matrix[6] = linear[5];
  matrix[8] = linear[6];
  matrix[9] = linear[7];
  matrix[10] = linear[8];
  matrix[12] = cx - transformedCenter[0];
  matrix[13] = cy - transformedCenter[1];
  matrix[14] = cz - transformedCenter[2];

  return matrix;
}

export function applyPlanarICameraToActor(args: {
  actor?: PlanarScalableActor;
  activeSourceICamera?: PlanarResolvedICamera;
}): void {
  const { actor, activeSourceICamera } = args;

  actor?.setUserMatrix?.(
    createPlanarPresentationScaleMatrix(activeSourceICamera)
  );
}

/**
 * Sets the clipping range on a vtkRenderer's camera to cover the full
 * volume depth. For parallel projection the range is symmetric around zero;
 * for perspective it starts at the minimum slab thickness.
 *
 * @param renderer - The VTK renderer whose camera clipping range is updated.
 */
export function setPlanarVolumeCameraClippingRange(
  renderer: vtkRenderer
): void {
  const camera = renderer.getActiveCamera();

  if (camera.getParallelProjection()) {
    camera.setClippingRange(
      -RENDERING_DEFAULTS.MAXIMUM_RAY_DISTANCE,
      RENDERING_DEFAULTS.MAXIMUM_RAY_DISTANCE
    );
    return;
  }

  camera.setClippingRange(
    RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS,
    RENDERING_DEFAULTS.MAXIMUM_RAY_DISTANCE
  );
}

/**
 * Ensures a vtkVolumeMapper has at least two clipping planes, creating
 * them if necessary. Returns the planes array.
 */
function ensureClippingPlanes(mapper: vtkVolumeMapper): vtkPlane[] {
  const existingClippingPlanes = mapper.getClippingPlanes();

  if (existingClippingPlanes.length >= 2) {
    return existingClippingPlanes as vtkPlane[];
  }

  mapper.addClippingPlane(vtkPlaneFactory.newInstance());
  mapper.addClippingPlane(vtkPlaneFactory.newInstance());

  return mapper.getClippingPlanes() as vtkPlane[];
}

/**
 * Updates the two clipping planes on a vtkVolumeMapper to clip the volume
 * to a slab centered on the camera's focal point. The slab is oriented
 * along the camera's view plane normal and extends `slabThickness` in
 * each direction from the focal point.
 *
 * @param args.camera - The resolved camera providing focalPoint and viewPlaneNormal.
 * @param args.mapper - The VTK volume mapper whose clipping planes are updated.
 * @param args.slabThickness - Half-thickness of the visible slab in world units.
 *   Defaults to `RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS`.
 */
export function updatePlanarVolumeClippingPlanes(args: {
  camera: Pick<ICamera, 'focalPoint' | 'viewPlaneNormal'>;
  mapper: vtkVolumeMapper;
  slabThickness?: number;
}): void {
  const {
    camera,
    mapper,
    slabThickness = RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS,
  } = args;
  const clippingPlanes = ensureClippingPlanes(mapper);
  const scaledDistance = camera.viewPlaneNormal.map(
    (value) => value * slabThickness
  ) as Point3;
  const clipPlane1Origin = [
    camera.focalPoint[0] - scaledDistance[0],
    camera.focalPoint[1] - scaledDistance[1],
    camera.focalPoint[2] - scaledDistance[2],
  ] as Point3;
  const clipPlane2Origin = [
    camera.focalPoint[0] + scaledDistance[0],
    camera.focalPoint[1] + scaledDistance[1],
    camera.focalPoint[2] + scaledDistance[2],
  ] as Point3;

  clippingPlanes[0].setNormal(...camera.viewPlaneNormal);
  clippingPlanes[0].setOrigin(...clipPlane1Origin);
  clippingPlanes[1].setNormal(
    -camera.viewPlaneNormal[0],
    -camera.viewPlaneNormal[1],
    -camera.viewPlaneNormal[2]
  );
  clippingPlanes[1].setOrigin(...clipPlane2Origin);
}
