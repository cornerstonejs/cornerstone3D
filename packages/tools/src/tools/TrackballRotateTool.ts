import vtkMath from '@kitware/vtk.js/Common/Core/Math';
import { Events } from '../enums';
import {
  Enums,
  eventTarget,
  getEnabledElement,
  getEnabledElementByIds,
  utilities as csUtils,
  getLossyDownsampling,
} from '@cornerstonejs/core';
import type {
  PlanarViewport,
  Types,
  GenericVolumeViewport3D,
} from '@cornerstonejs/core';
import { mat4, vec3 } from 'gl-matrix';
import type { EventTypes, PublicToolProps, ToolProps } from '../types';
import { BaseTool } from './base';
import { getToolGroup } from '../store/ToolGroupManager';
import getViewportICamera from '../utilities/getViewportICamera';
import setViewportCamera, {
  resetViewportCamera,
} from '../utilities/setViewportCamera';
import {
  applyViewportPresentation,
  getViewportPresentation,
} from '../utilities/viewportPresentation';

/**
 * The reset of the resize of an element. A legacy `resetCamera()` kept the
 * orientation that the tool had turned to, and so does a 3D viewport. The
 * reset of a planar viewport goes back to the first orientation unless it
 * is told to keep it.
 */
const KEEP_ORIENTATION = { resetOrientation: false };

class TrackballRotateTool extends BaseTool {
  static toolName;
  touchDragCallback: (evt: EventTypes.InteractionEventType) => void;
  mouseDragCallback: (evt: EventTypes.InteractionEventType) => void;
  cleanUp: () => void;
  _resizeObservers = new Map();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _viewportAddedListener: (evt: any) => void;
  _hasResolutionChanged = false;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        rotateIncrementDegrees: 2,
        rotateSampleDistanceFactor: 2, // Factor to increase sample distance (lower resolution) when rotating
      },
    }
  ) {
    super(toolProps, defaultToolProps);
    this.touchDragCallback = this._dragCallback.bind(this);
    this.mouseDragCallback = this._dragCallback.bind(this);
  }

  preMouseDownCallback = (evt: EventTypes.InteractionEventType) => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;
    const enabledElement = getEnabledElement(element);
    const viewport = enabledElement.viewport as GenericVolumeViewport3D;
    const actor = viewport.getDefaultActor()?.actor as
      | Types.VolumeActor
      | undefined;
    const mapper = actor?.getMapper();

    const hasSampleDistance =
      !!mapper &&
      ('getSampleDistance' in mapper || 'getCurrentSampleDistance' in mapper);

    if (!hasSampleDistance) {
      return true;
    }

    const originalSampleDistance = mapper.getSampleDistance();

    if (!this._hasResolutionChanged) {
      // A larger sample distance is an interactive downsampling.
      const rotateSampleDistanceFactor = getLossyDownsampling().interactive
        ? this.configuration.rotateSampleDistanceFactor
        : 1;
      mapper.setSampleDistance(
        originalSampleDistance * rotateSampleDistanceFactor
      );
      this._hasResolutionChanged = true;

      if (this.cleanUp !== null) {
        // Clean up previous event listener
        document.removeEventListener('mouseup', this.cleanUp);
        document.removeEventListener('touchend', this.cleanUp);
        document.removeEventListener('touchcancel', this.cleanUp);
      }

      this.cleanUp = () => {
        // All listener types are armed below; whichever fires first must
        // clear the others so no stale once-listener lingers on document.
        document.removeEventListener('mouseup', this.cleanUp);
        document.removeEventListener('touchend', this.cleanUp);
        document.removeEventListener('touchcancel', this.cleanUp);
        mapper.setSampleDistance(originalSampleDistance);
        viewport.render();
        this._hasResolutionChanged = false;
      };

      document.addEventListener('mouseup', this.cleanUp, { once: true });
      document.addEventListener('touchend', this.cleanUp, { once: true });
      // OS-interrupted gestures (incoming call, notification shade) end in
      // touchcancel, never touchend.
      document.addEventListener('touchcancel', this.cleanUp, { once: true });
    }
    return true;
  };

  _getViewportsInfo = () => {
    const viewports = getToolGroup(this.toolGroupId).viewportsInfo;
    return viewports;
  };

  onSetToolActive = () => {
    const subscribeToElementResize = () => {
      const viewportsInfo = this._getViewportsInfo();
      viewportsInfo.forEach(({ viewportId, renderingEngineId }) => {
        if (!this._resizeObservers.has(viewportId)) {
          const { viewport } = getEnabledElementByIds(
            viewportId,
            renderingEngineId
          ) || { viewport: null };

          if (!viewport) {
            return;
          }

          const { element } = viewport;

          const resizeObserver = new ResizeObserver(() => {
            const element = getEnabledElementByIds(
              viewportId,
              renderingEngineId
            );
            if (!element) {
              return;
            }
            const { viewport } = element;

            const viewPresentation = getViewportPresentation(viewport);

            resetViewportCamera(viewport, KEEP_ORIENTATION);

            applyViewportPresentation(viewport, viewPresentation);
            viewport.render();
          });

          resizeObserver.observe(element);
          this._resizeObservers.set(viewportId, resizeObserver);
        }
      });
    };

    subscribeToElementResize();

    this._viewportAddedListener = (evt) => {
      if (evt.detail.toolGroupId === this.toolGroupId) {
        subscribeToElementResize();
      }
    };

    eventTarget.addEventListener(
      Events.TOOLGROUP_VIEWPORT_ADDED,
      this._viewportAddedListener
    );
  };

  onSetToolDisabled = () => {
    // Disconnect all resize observers
    this._resizeObservers.forEach((resizeObserver, viewportId) => {
      resizeObserver.disconnect();
      this._resizeObservers.delete(viewportId);
    });

    if (this._viewportAddedListener) {
      eventTarget.removeEventListener(
        Events.TOOLGROUP_VIEWPORT_ADDED,
        this._viewportAddedListener
      );
      this._viewportAddedListener = null; // Clear the reference to the listener
    }
  };

  rotateCamera = (viewport, centerWorld, axis, angle) => {
    if (viewport.type === Enums.ViewportType.PLANAR_NEXT) {
      this._rotatePlanarView(viewport, centerWorld, axis, angle);

      return;
    }

    const vtkCamera = viewport.getVtkActiveCamera();
    const viewUp = vtkCamera.getViewUp();
    const focalPoint = vtkCamera.getFocalPoint();
    const position = vtkCamera.getPosition();

    const newPosition: Types.Point3 = [0, 0, 0];
    const newFocalPoint: Types.Point3 = [0, 0, 0];
    const newViewUp: Types.Point3 = [0, 0, 0];

    const transform = mat4.identity(new Float32Array(16));
    mat4.translate(transform, transform, centerWorld);
    mat4.rotate(transform, transform, angle, axis);
    mat4.translate(transform, transform, [
      -centerWorld[0],
      -centerWorld[1],
      -centerWorld[2],
    ]);
    vec3.transformMat4(newPosition, position, transform);
    vec3.transformMat4(newFocalPoint, focalPoint, transform);

    mat4.identity(transform);
    mat4.rotate(transform, transform, angle, axis);
    vec3.transformMat4(newViewUp, viewUp, transform);

    setViewportCamera(viewport, {
      position: newPosition,
      viewUp: newViewUp,
      focalPoint: newFocalPoint,
    });
  };

  /**
   * Turns the view of a planar viewport that shows a volume by an angle about
   * an axis through a world point, as the camera of a legacy volume viewport
   * turned about its focal point. The orientation of the view state turns,
   * the cut goes through the point, the point stays at the centre of the
   * canvas, and the size of the picture stays: a fit to the new cut would
   * change it. A viewport that shows a stack has one orientation, so nothing
   * changes there.
   */
  private _rotatePlanarView(
    viewport: PlanarViewport,
    centerWorld: Types.Point3,
    axis: Types.Point3,
    angle: number
  ): void {
    const { viewPlaneNormal, viewUp } = getViewportICamera(viewport);

    if (!csUtils.viewportIsInVolumeMode(viewport) || !viewPlaneNormal) {
      return;
    }

    const rotation = mat4.fromRotation(mat4.create(), angle, axis);
    const parallelScale = viewport.getResolvedView()?.toICamera().parallelScale;

    viewport.setViewState({
      orientation: {
        viewPlaneNormal: vec3.transformMat4(
          vec3.create(),
          viewPlaneNormal,
          rotation
        ) as Types.Point3,
        viewUp: vec3.transformMat4(
          vec3.create(),
          viewUp,
          rotation
        ) as Types.Point3,
      },
      slice: { kind: 'volumePoint', sliceWorldPoint: centerWorld },
      anchorWorld: centerWorld,
      anchorCanvas: [0.5, 0.5],
    });

    const fittedParallelScale = viewport
      .getResolvedView()
      ?.toICamera().parallelScale;

    if (
      parallelScale &&
      fittedParallelScale &&
      fittedParallelScale !== parallelScale
    ) {
      const [scaleX, scaleY] = viewport.getScale();
      const fitRatio = fittedParallelScale / parallelScale;

      viewport.setScale([scaleX * fitRatio, scaleY * fitRatio]);
    }
  }

  _dragCallback(evt: EventTypes.InteractionEventType): void {
    const { element, currentPoints, lastPoints } = evt.detail;
    const currentPointsCanvas = currentPoints.canvas;
    const lastPointsCanvas = lastPoints.canvas;
    const { rotateIncrementDegrees } = this.configuration;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    const camera = getViewportICamera(viewport);
    const width = element.clientWidth;
    const height = element.clientHeight;

    const normalizedPosition = [
      currentPointsCanvas[0] / width,
      currentPointsCanvas[1] / height,
    ];

    const normalizedPreviousPosition = [
      lastPointsCanvas[0] / width,
      lastPointsCanvas[1] / height,
    ];

    const center: Types.Point2 = [width * 0.5, height * 0.5];
    // NOTE: centerWorld corresponds to the focal point in cornerstone3D
    const centerWorld = viewport.canvasToWorld(center);
    const normalizedCenter = [0.5, 0.5];

    const radsq = (1.0 + Math.abs(normalizedCenter[0])) ** 2.0;
    const op = [normalizedPreviousPosition[0], 0, 0];
    const oe = [normalizedPosition[0], 0, 0];

    const opsq = op[0] ** 2;
    const oesq = oe[0] ** 2;

    const lop = opsq > radsq ? 0 : Math.sqrt(radsq - opsq);
    const loe = oesq > radsq ? 0 : Math.sqrt(radsq - oesq);

    const nop: Types.Point3 = [op[0], 0, lop];
    vtkMath.normalize(nop);
    const noe: Types.Point3 = [oe[0], 0, loe];
    vtkMath.normalize(noe);

    const dot = vtkMath.dot(nop, noe);
    if (Math.abs(dot) > 0.0001) {
      const angleX =
        -2 *
        Math.acos(vtkMath.clampValue(dot, -1.0, 1.0)) *
        Math.sign(normalizedPosition[0] - normalizedPreviousPosition[0]) *
        rotateIncrementDegrees;

      const upVec = camera.viewUp;
      const atV = camera.viewPlaneNormal;
      const rightV: Types.Point3 = [0, 0, 0];
      const forwardV: Types.Point3 = [0, 0, 0];

      vtkMath.cross(upVec, atV, rightV);
      vtkMath.normalize(rightV);

      vtkMath.cross(atV, rightV, forwardV);
      vtkMath.normalize(forwardV);
      vtkMath.normalize(upVec);

      this.rotateCamera(viewport, centerWorld, forwardV, angleX);

      const angleY =
        (normalizedPreviousPosition[1] - normalizedPosition[1]) *
        rotateIncrementDegrees;

      this.rotateCamera(viewport, centerWorld, rightV, angleY);

      viewport.render();
    }
  }
}

TrackballRotateTool.toolName = 'TrackballRotate';
export default TrackballRotateTool;
