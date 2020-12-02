// @ts-ignore
import { BaseTool } from './base/index.ts';
// ~~ VTK Viewport
import { getEnabledElement, imageCache } from './../../index';
import { vec3 } from 'gl-matrix';

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
      isOrthogonal,
      spacingInNormalDirection,
      imageVolume,
    } = this._getTargetVolume(scene, camera);

    // TODO calculate these bounds.
    // Cache these during a drag?
    // - Cache on mouse down?
    // - Decache on mouse up?

    if (isOrthogonal) {
      // Orthogonal, scroll through slices, capped by bounds.
    } else {
      // Non-orthogonal, just scroll by spacing in normal direction, capped by bounds.
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
        isOrthogonal,
      } = this._getSpacingInNormalDirectionAndCheckIfOrthogonal(
        imageVolume,
        viewPlaneNormal
      );

      return { imageVolume, spacingInNormalDirection, isOrthogonal };
    }

    // Fetch volume actor with finest resolution in direction of projection.

    const smallest = {
      spacingInNormalDirection: Infinity,
      imageVolume: null,
      isOrthogonal: null,
    };

    for (let i = 0; i < numVolumeActors; i++) {
      const imageVolume = imageVolumes[i];

      const {
        spacingInNormalDirection,
        isOrthogonal,
      } = this._getSpacingInNormalDirectionAndCheckIfOrthogonal(
        imageVolume,
        viewPlaneNormal
      );

      if (spacingInNormalDirection < smallest.spacingInNormalDirection) {
        smallest.spacingInNormalDirection = spacingInNormalDirection;
        smallest.imageVolume = imageVolume;
        smallest.isOrthogonal = isOrthogonal;
      }
    }

    return smallest;
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

    const isOrthogonal = this._isOrthogonal(dotProducts);

    const projectedSpacing = [
      dotProducts[0] * spacing[0],
      dotProducts[1] * spacing[1],
      dotProducts[2] * spacing[2],
    ];

    const spacingInNormalDirection = vec3.length(projectedSpacing);

    return { spacingInNormalDirection, isOrthogonal };
  };

  _isOrthogonal = dotProducts => {
    return dotProducts.some(
      dp => Math.abs(Math.abs(dp) - 1) < ORTHOGONAL_THRESHOLD
    );
  };
}

const ORTHOGONAL_THRESHOLD = 1e-5;
