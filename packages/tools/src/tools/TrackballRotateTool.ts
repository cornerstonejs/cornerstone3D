import vtkMath from '@kitware/vtk.js/Common/Core/Math';
import { Events } from '../enums';

import {
  eventTarget,
  getEnabledElement,
  getEnabledElementByIds,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { mat4, vec3 } from 'gl-matrix';
import { EventTypes, PublicToolProps, ToolProps } from '../types';
import { BaseTool } from './base';
import { getToolGroup } from '../store/ToolGroupManager';
import { IStackViewport, IVolumeViewport } from 'core/src/types';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';

/**
 * Tool that rotates the camera in the plane defined by the viewPlaneNormal and the viewUp.
 */
class TrackballRotateTool extends BaseTool {
  static toolName;
  originalSampleDistance = null;
  preMouseDownCallback: (evt: EventTypes.InteractionEventType) => void;
  mouseUpCallback: (evt: EventTypes.InteractionEventType) => void;
  touchDragCallback: (evt: EventTypes.InteractionEventType) => void;
  mouseDragCallback: (evt: EventTypes.InteractionEventType) => void;
  cleanUp: () => void;
  _resizeObservers = new Map();
  _viewportAddedListener: (evt: any) => void;

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
    this.preMouseDownCallback = this._preMouseDownCallback.bind(this);
    this.mouseUpCallback = this._mouseUpCallback.bind(this);
  }

  _getMapperFromViewport = (
    viewport: IStackViewport | IVolumeViewport
  ): vtkVolumeMapper => {
    const actorEntry = viewport.getDefaultActor();
    const actor = actorEntry.actor as Types.VolumeActor;
    const mapper = actor.getMapper();
    return mapper;
  };

  _reduceSampleDistance = (viewport: IStackViewport | IVolumeViewport) => {
    const mapper = this._getMapperFromViewport(viewport);
    if (this.originalSampleDistance === null) {
      //Store the origial sample distance at the first call to be able to restore it
      this.originalSampleDistance = mapper.getSampleDistance();
    }
    mapper.setSampleDistance(this.originalSampleDistance * 2);
  };

  _restoreSampleDistance = (viewport: IStackViewport | IVolumeViewport) => {
    const mapper = this._getMapperFromViewport(viewport);
    mapper.setSampleDistance(this.originalSampleDistance);
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
            viewport.resetCamera();
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
  };

  _preMouseDownCallback(evt: EventTypes.InteractionEventType): void {
    console.log('premousedown');
    const { element } = evt.detail;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    this._reduceSampleDistance(viewport);
  }

  _mouseUpCallback(evt: EventTypes.InteractionEventType): void {
    console.log('mouseup');
    const { element } = evt.detail;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    this._restoreSampleDistance(viewport);
  }

  // pseudocode inspired from
  // https://github.com/kitware/vtk-js/blob/HEAD/Sources/Interaction/Manipulators/MouseCameraUnicamRotateManipulator/index.js
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
