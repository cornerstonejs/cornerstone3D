import { BaseTool } from './base/index';
// ~~ VTK Viewport
import { getEnabledElement, imageCache } from './../../index';
import { vec3 } from 'gl-matrix';

import getVolumeActorCorners from '../util/vtkjs/getVolumeActorCorners';
import vtkMatrixBuilder from 'vtk.js/Sources/Common/Core/MatrixBuilder';

export default class StackScrollTool extends BaseTool {
  touchDragCallback: Function;
  mouseDragCallback: Function;
  _configuration: any;

  // Apparently TS says super _must_ be the first call? This seems a bit opinionated.
  constructor(toolConfiguration = {}) {
    super(toolConfiguration, {
      name: 'StackScroll',
      supportedInteractionTypes: ['Mouse', 'Touch'],
    });

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
    const { spacingInNormalDirection, imageVolume } = this._getTargetVolume(
      scene,
      camera
    );

    const volumeActor = scene.getVolumeActor(imageVolume.uid);

    const scrollRange = this._getSliceRange(
      volumeActor,
      viewPlaneNormal,
      focalPoint
    );

    // TODO calculate these bounds.
    // Cache these during a drag?
    // - Cache on mouse down?
    // - Decache on mouse up?
    // TODO - How do we cache on mouse wheel scroll?
    // TODO Is this tool per element or what? Could just cache here.

    // Snaps to a slice if orthogonal, will snap to certain increments
    // As defined by the spacingInNormalDirection if oblique.
    const { slicePos, newFocalPoint } = this._snapFocalPointToSlice(
      focalPoint,
      scrollRange,
      viewPlaneNormal,
      spacingInNormalDirection
    );

    const { min, max } = scrollRange;

    const { y: deltaY } = deltaPoints.canvas;
    let scrollDistance = spacingInNormalDirection * deltaY;

    if (slicePos + scrollDistance > max) {
      scrollDistance = max - slicePos;
    } else if (slicePos + scrollDistance < min) {
      scrollDistance = slicePos - min;
    }

    // Move delta y slices

    newFocalPoint[0] += viewPlaneNormal[0] * scrollDistance;
    newFocalPoint[1] += viewPlaneNormal[1] * scrollDistance;
    newFocalPoint[2] += viewPlaneNormal[2] * scrollDistance;

    const focalPointDiff = [
      newFocalPoint[0] - focalPoint[0],
      newFocalPoint[1] - focalPoint[1],
      newFocalPoint[2] - focalPoint[2],
    ];

    const newPosition = [
      (position[0] += focalPointDiff[0]),
      (position[1] += focalPointDiff[1]),
      (position[2] += focalPointDiff[2]),
    ];

    enabledElement.viewport.setCamera({
      focalPoint: newFocalPoint,
      position: newPosition,
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

    const newFocalPoint = [
      focalPoint[0] + viewPlaneNormal[0] * diff,
      focalPoint[1] + viewPlaneNormal[1] * diff,
      focalPoint[2] + viewPlaneNormal[2] * diff,
    ];

    return { slicePos, newFocalPoint };
  };

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

      const spacingInNormalDirection = this._getSpacingInNormalDirection(
        imageVolume,
        viewPlaneNormal
      );

      return { imageVolume, spacingInNormalDirection };
    }

    // Fetch volume actor with finest resolution in direction of projection.

    const smallest = {
      spacingInNormalDirection: Infinity,
      imageVolume: null,
    };

    for (let i = 0; i < numVolumeActors; i++) {
      const imageVolume = imageVolumes[i];

      const spacingInNormalDirection = this._getSpacingInNormalDirection(
        imageVolume,
        viewPlaneNormal
      );

      if (spacingInNormalDirection < smallest.spacingInNormalDirection) {
        smallest.spacingInNormalDirection = spacingInNormalDirection;
        smallest.imageVolume = imageVolume;
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

  _getSpacingInNormalDirection = (imageVolume, viewPlaneNormal) => {
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

    const projectedSpacing = [
      dotProducts[0] * spacing[0],
      dotProducts[1] * spacing[1],
      dotProducts[2] * spacing[2],
    ];

    const spacingInNormalDirection = vec3.length(projectedSpacing);

    return spacingInNormalDirection;
  };
}

const EDGE_TOLERANCE = 1e-5;
