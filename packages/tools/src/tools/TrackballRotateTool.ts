import vtkMath from '@kitware/vtk.js/Common/Core/Math';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import { Events } from '../enums';
import {
  eventTarget,
  getEnabledElement,
  getEnabledElementByIds,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { mat4, vec3 } from 'gl-matrix';
import type { EventTypes, PublicToolProps, ToolProps } from '../types';
import { BaseTool } from './base';
import { getToolGroup } from '../store/ToolGroupManager';

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
    const { viewport } = enabledElement;
    const actorEntry = viewport.getDefaultActor();
    const actor = actorEntry.actor as Types.VolumeActor;
    const mapper = actor.getMapper();

    const hasSampleDistance =
      'getSampleDistance' in mapper || 'getCurrentSampleDistance' in mapper;

    if (!hasSampleDistance) {
      return true;
    }

    const originalSampleDistance = mapper.getSampleDistance();

    if (!this._hasResolutionChanged) {
      mapper.setSampleDistance(originalSampleDistance * 2);
      this._hasResolutionChanged = true;

      if (this.cleanUp !== null) {
        // Clean up previous event listener
        document.removeEventListener('mouseup', this.cleanUp);
      }

      this.cleanUp = () => {
        mapper.setSampleDistance(originalSampleDistance);
        viewport.render();
        this._hasResolutionChanged = false;
      };

      document.addEventListener('mouseup', this.cleanUp, { once: true });
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

            const viewPresentation = viewport.getViewPresentation();

            viewport.resetCamera();

            viewport.setViewPresentation(viewPresentation);
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

  // Helper to transform a normal by a 3x3 matrix
  _transformNormal(normal, mat) {
    return [
      mat[0] * normal[0] + mat[3] * normal[1] + mat[6] * normal[2],
      mat[1] * normal[0] + mat[4] * normal[1] + mat[7] * normal[2],
      mat[2] * normal[0] + mat[5] * normal[1] + mat[8] * normal[2],
    ];
  }

  // Update all clipping planes after rotation
  _updateClippingPlanes(viewport) {
    const actorEntry = viewport.getDefaultActor();
    const actor = actorEntry.actor as Types.VolumeActor;
    const mapper = actor.getMapper();
    const matrix = actor.getMatrix();
    // Extract rotation part for normals
    const rot = [
      matrix[0],
      matrix[1],
      matrix[2],
      matrix[4],
      matrix[5],
      matrix[6],
      matrix[8],
      matrix[9],
      matrix[10],
    ];

    const originalPlanes = viewport.getOriginalClippingPlanes();
    if (!originalPlanes || originalPlanes.length === 0) {
      return;
    }

    mapper.removeAllClippingPlanes();
    originalPlanes.forEach(({ origin, normal }) => {
      // Transform origin (full 4x4)
      const o = [
        matrix[0] * origin[0] +
          matrix[4] * origin[1] +
          matrix[8] * origin[2] +
          matrix[12],
        matrix[1] * origin[0] +
          matrix[5] * origin[1] +
          matrix[9] * origin[2] +
          matrix[13],
        matrix[2] * origin[0] +
          matrix[6] * origin[1] +
          matrix[10] * origin[2] +
          matrix[14],
      ];
      // Transform normal (rotation only)
      const n = this._transformNormal(normal, rot);
      // const plane = vtkPlane.newInstance({ origin: o, normal: n });
      const plane = vtkPlane.newInstance({ origin: o, normal: n });
      mapper.addClippingPlane(plane);
    });
  }

  rotateCamera = (viewport, centerWorld, axis, angle) => {
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

    viewport.setCamera({
      position: newPosition,
      viewUp: newViewUp,
      focalPoint: newFocalPoint,
    });

    // Update clipping planes after rotation
    this._updateClippingPlanes(viewport);
  };

  _dragCallback(evt: EventTypes.InteractionEventType): void {
    const { element, currentPoints, lastPoints } = evt.detail;
    const currentPointsCanvas = currentPoints.canvas;
    const lastPointsCanvas = lastPoints.canvas;
    const { rotateIncrementDegrees } = this.configuration;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    const camera = viewport.getCamera();
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
