// @ts-ignore
import { BaseTool } from './base/index.ts';
// ~~ VTK Viewport
import { getEnabledElement, imageCache } from './../../index';
import { vec3 } from 'gl-matrix';
// @ts-ignore
import getVolumeActorCorners from '../util/vtkjs/getVolumeActorCorners.ts';

import vtkMatrixBuilder from 'vtk.js/Sources/Common/Core/MatrixBuilder';

export default class StackScrollTool extends BaseTool {
  touchDragCallback: Function;
  mouseDragCallback: Function;
  _configuration: any;

  // @ts-ignore // Apparently TS says super _must_ be the first call? This seems a bit opinionated.
  constructor(toolConfiguration = {}) {
    const defaultToolConfiguration = {
      name: 'StackScroll',
      supportedInteractionTypes: ['Mouse', 'Touch'],
    };

    super(toolConfiguration, defaultToolConfiguration);

    /**
     * Will only fire fore cornerstone events:
     * - TOUCH_DRAG
     * - MOUSE_DRAG
     *
     * Given that the tool is active and has matching bindings for the
     * underlying touch/mouse event.
     */
    this.touchDragCallback = this._dragCallback.bind(this);
    this.mouseDragCallback = this._dragCallback.bind(this);
  }

  // Takes ICornerstoneEvent, Mouse or Touch
  _dragCallback(evt) {
    const { element: canvas, deltaPoints } = evt.detail;
    const enabledElement = getEnabledElement(canvas);
    const { scene, viewport } = enabledElement;
    const camera = viewport.getCamera();
    const { focalPoint, viewPlaneNormal, position } = camera;

    // Stack scroll across highest resolution volume.
    const {
      orthogonalDirection,
      spacingInNormalDirection,
      imageVolume,
    } = this._getTargetVolume(scene, camera);

    const volumeActor = scene.getVolumeActor(imageVolume.uid);

    const scrollRange = this._getSliceRange(
      volumeActor,
      viewPlaneNormal,
      focalPoint
    );

    const newFocalPoint = [...focalPoint];

    debugger;

    // TODO calculate these bounds.
    // Cache these during a drag?
    // - Cache on mouse down?
    // - Decache on mouse up?
    // TODO - How do we cache on mouse wheel scroll?
    // TODO Is this tool per element or what? Could just cache here.

    if (orthogonalDirection) {
      this._snapFocalPointToSlice(
        newFocalPoint,
        scrollRange,
        viewPlaneNormal,
        spacingInNormalDirection
      );

      // TODO: Cache this then just increment up or down
      // const currentSliceIndex = this._getCurrentSliceIndexOrthogonal(
      //   imageVolume,
      //   focalPoint,
      //   direction
      // );

      // Orthogonal, scroll through slices, capped by bounds.
      // TODO -> Clamp current focal point to middle of slice coord.
      // Then move by exact increments of the size.
    } else {
      // Non-orthogonal, just scroll by spacing in normal direction, capped by bounds.

      console.warn('TODO! Non-orthogonal scroll');
    }

    const { y: deltaY } = deltaPoints.canvas;

    const updatedFocalPoint = focalPoint;
    const updatedPosition = position;

    enabledElement.viewport.setCamera({
      focalPoint: updatedFocalPoint,
      position: updatedPosition,
    });
    enabledElement.viewport.render();
  }

  _snapFocalPointToSlice = (
    focalPoint,
    scrollRange,
    viewPlaneNormal,
    spacingInNormalDirection
  ) => {
    const { min, max, current } = scrollRange;

    debugger;

    let steps = (max - min) / spacingInNormalDirection;
    steps = Math.floor(steps);

    const slices = steps + 1; // N slices with N-1 steps between.

    const fraction = (current - min) / (max - min);
    const sliceNumber = Math.floor(fraction * steps);

    let slicePos = min + sliceNumber * spacingInNormalDirection;

    // Move to the center of the slice
    slicePos += 0.5 * spacingInNormalDirection;

    // Now that we have the slice in our dolly range,
    // Dolly the focal point along the viewPlaneNormal direction

    const diff = slicePos - current;

    debugger;

    debugger;
  };

  // private _getCurrentSliceIndexOrthogonal = (
  //   imageVolume,
  //   focalPoint,
  //   direction
  // ) => {
  //   const { origin, spacing, dimensions } = imageVolume;

  //   const { index, positive } = direction;

  //   const originInDirection = origin[index];
  //   const focalPointInDirection = focalPoint[index];
  //   const spacingInDirection = spacing[index];
  //   const dimensionInDirection = dimensions[index];
  //   let slicePos = originInDirection;

  //   debugger;

  //   //for (let i =0; i < )

  //   debugger;
  // };

  private _getTargetVolume = (scene, camera) => {
    const { viewPlaneNormal } = camera;
    const { volumeUID } = this._configuration;

    const volumeActors = scene.getVolumeActors();
    const numVolumeActors = volumeActors.length;

    if (!volumeActors && !volumeActors.length) {
      // No stack to scroll through
      return { spacingInNormalDirection: null, imageVolume: null };
    }

    const imageVolumes = volumeActors.map(va =>
      imageCache.getImageVolume(va.uid)
    );

    if (volumeUID) {
      // If a volumeUID is defined, set that volume as the target
      const imageVolume = imageVolumes.find(iv => iv.uid === volumeUID);

      const {
        spacingInNormalDirection,
        orthogonalDirection,
      } = this._getSpacingInNormalDirectionAndCheckIfOrthogonal(
        imageVolume,
        viewPlaneNormal
      );

      return { imageVolume, spacingInNormalDirection, orthogonalDirection };
    }

    // Fetch volume actor with finest resolution in direction of projection.

    const smallest = {
      spacingInNormalDirection: Infinity,
      imageVolume: null,
      orthogonalDirection: null,
    };

    for (let i = 0; i < numVolumeActors; i++) {
      const imageVolume = imageVolumes[i];

      const {
        spacingInNormalDirection,
        orthogonalDirection,
      } = this._getSpacingInNormalDirectionAndCheckIfOrthogonal(
        imageVolume,
        viewPlaneNormal
      );

      if (spacingInNormalDirection < smallest.spacingInNormalDirection) {
        smallest.spacingInNormalDirection = spacingInNormalDirection;
        smallest.imageVolume = imageVolume;
        smallest.orthogonalDirection = orthogonalDirection;
      }
    }

    return smallest;
  };

  _getSliceRange = (volumeActor, viewPlaneNormal, focalPoint) => {
    const corners = getVolumeActorCorners(volumeActor);

    // Get rotation matrix from normal to +X (since bounds is aligned to XYZ)
    const transform = vtkMatrixBuilder
      .buildFromDegree()
      .identity()
      .rotateFromDirections(viewPlaneNormal, [1, 0, 0]);

    corners.forEach(pt => transform.apply(pt));

    let transformedFocalPoint = [...focalPoint];

    transform.apply(transformedFocalPoint);

    const currentSlice = transformedFocalPoint[0];

    // range is now maximum X distance
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < 8; i++) {
      const x = corners[i][0];
      if (x > maxX) {
        maxX = x;
      }
      if (x < minX) {
        minX = x;
      }
    }

    return { min: minX, max: maxX, current: currentSlice };
  };

  _getSpacingInNormalDirectionAndCheckIfOrthogonal = (
    imageVolume,
    viewPlaneNormal
  ) => {
    const { direction, spacing } = imageVolume;

    // Calculate size of spacing vector in normal direction

    const iVector = direction.slice(0, 3);
    const jVector = direction.slice(3, 6);
    const kVector = direction.slice(6, 9);

    const dotProducts = [
      vec3.dot(iVector, viewPlaneNormal),
      vec3.dot(jVector, viewPlaneNormal),
      vec3.dot(kVector, viewPlaneNormal),
    ];

    const orthogonalDirection = this._getOrthogonalDirection(dotProducts);

    const projectedSpacing = [
      dotProducts[0] * spacing[0],
      dotProducts[1] * spacing[1],
      dotProducts[2] * spacing[2],
    ];

    const spacingInNormalDirection = vec3.length(projectedSpacing);

    return { spacingInNormalDirection, orthogonalDirection };
  };

  private _getOrthogonalDirection = dotProducts => {
    let dp = dotProducts[0];

    if (Math.abs(Math.abs(dp) - 1) < ORTHOGONAL_THRESHOLD) {
      if (dp > 0) {
        return ORTHOGONAL_DIRECTIONS.POSITIVE_I;
      }

      return ORTHOGONAL_DIRECTIONS.NEGATIVE_I;
    }

    dp = dotProducts[1];

    if (Math.abs(Math.abs(dp) - 1) < ORTHOGONAL_THRESHOLD) {
      if (dp > 0) {
        return ORTHOGONAL_DIRECTIONS.POSITIVE_J;
      }

      return ORTHOGONAL_DIRECTIONS.NEGATIVE_J;
    }

    dp = dotProducts[2];

    if (Math.abs(Math.abs(dp) - 1) < ORTHOGONAL_THRESHOLD) {
      if (dp > 0) {
        return ORTHOGONAL_DIRECTIONS.POSITIVE_K;
      }

      return ORTHOGONAL_DIRECTIONS.NEGATIVE_K;
    }

    return false;
  };
}

const ORTHOGONAL_DIRECTIONS = {
  POSITIVE_I: { index: 0, positive: true },
  POSITIVE_J: { index: 1, positive: true },
  POSITIVE_K: { index: 2, positive: true },
  NEGATIVE_I: { index: 0, positive: false },
  NEGATIVE_J: { index: 1, positive: false },
  NEGATIVE_K: { index: 2, positive: false },
};

const ORTHOGONAL_THRESHOLD = 1e-5;
