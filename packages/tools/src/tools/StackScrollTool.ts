import {
  getEnabledElementByIds,
  getEnabledElement,
  VolumeViewport,
  type Types,
  BaseVolumeViewport,
} from '@cornerstonejs/core';
import { BaseTool } from './base';
import { scroll } from '../utilities';
import { mat4, vec3 } from 'gl-matrix';
import type { PublicToolProps, ToolProps, EventTypes } from '../types';

const DIRECTIONS = {
  X: [1, 0, 0],
  Y: [0, 1, 0],
  Z: [0, 0, 1],
  CUSTOM: [],
};

/**
 * The StackScrollTool is a tool that allows the user to scroll through a
 * stack of images by pressing the mouse click and dragging
 */
class StackScrollTool extends BaseTool {
  static toolName;
  deltaY: number;
  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        invert: false,
        debounceIfNotLoaded: true,
        loop: false,
        // this tool can also be used to rotate the volume for instance for MIP
        rotate: {
          enabled: false,
          direction: DIRECTIONS.Z,
          rotateIncrementDegrees: 30,
        },
      },
    }
  ) {
    super(toolProps, defaultToolProps);
    this.deltaY = 1;
  }

  mouseWheelCallback(evt: EventTypes.MouseWheelEventType) {
    // based on configuration, we decide if we want to scroll or rotate
    if (this.configuration.rotate.enabled) {
      this._rotate(evt);
    } else {
      this._scroll(evt);
    }
  }

  mouseDragCallback(evt: EventTypes.InteractionEventType) {
    this._dragCallback(evt);
  }
  touchDragCallback(evt: EventTypes.InteractionEventType) {
    this._dragCallback(evt);
  }

  _dragCallback(evt: EventTypes.InteractionEventType) {
    if (this.configuration.rotate.enabled) {
      this._rotateDrag(evt);
    } else {
      this._scrollDrag(evt);
    }
  }

  _rotateDrag(evt: EventTypes.InteractionEventType) {
    const { deltaPoints, element } = evt.detail;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const { direction, rotateIncrementDegrees } = this.configuration.rotate;

    const camera = viewport.getCamera();
    const { viewUp, position, focalPoint } = camera;

    const deltaY = deltaPoints.canvas[1];

    const [cx, cy, cz] = focalPoint;
    const [ax, ay, az] = direction;

    // Calculate angle in radians
    const angle = (deltaY * (rotateIncrementDegrees * Math.PI)) / 180;

    const newPosition: Types.Point3 = [0, 0, 0];
    const newFocalPoint: Types.Point3 = [0, 0, 0];
    const newViewUp: Types.Point3 = [0, 0, 0];

    const transform = mat4.identity(new Float32Array(16));
    mat4.translate(transform, transform, [cx, cy, cz]);
    mat4.rotate(transform, transform, angle, [ax, ay, az]);
    mat4.translate(transform, transform, [-cx, -cy, -cz]);
    vec3.transformMat4(newPosition, position, transform);
    vec3.transformMat4(newFocalPoint, focalPoint, transform);

    mat4.identity(transform);
    mat4.rotate(transform, transform, angle, [ax, ay, az]);
    vec3.transformMat4(<Types.Point3>newViewUp, viewUp, transform);

    viewport.setCamera({
      position: newPosition,
      viewUp: newViewUp,
      focalPoint: newFocalPoint,
    });

    viewport.render();
  }

  _scrollDrag(evt: EventTypes.InteractionEventType) {
    const { deltaPoints, viewportId, renderingEngineId } = evt.detail;
    const { viewport } = getEnabledElementByIds(viewportId, renderingEngineId);
    const { debounceIfNotLoaded, invert, loop } = this.configuration;
    const deltaPointY = deltaPoints.canvas[1];

    let volumeId;
    if (viewport instanceof VolumeViewport) {
      volumeId = viewport.getVolumeId();
    }

    const pixelsPerImage = this._getPixelPerImage(viewport);
    const deltaY = deltaPointY + this.deltaY;

    if (!pixelsPerImage) {
      return;
    }

    if (Math.abs(deltaY) >= pixelsPerImage) {
      const imageIdIndexOffset = Math.round(deltaY / pixelsPerImage);

      scroll(viewport, {
        delta: invert ? -imageIdIndexOffset : imageIdIndexOffset,
        volumeId,
        debounceLoading: debounceIfNotLoaded,
        loop: loop,
      });

      this.deltaY = deltaY % pixelsPerImage;
    } else {
      this.deltaY = deltaY;
    }
  }

  _rotate(evt) {
    // https://github.com/kitware/vtk-js/blob/HEAD/Sources/Interaction/Manipulators/MouseCameraUnicamRotateManipulator/index.js#L73
    const { element, wheel } = evt.detail;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const { direction, rotateIncrementDegrees } = this.configuration.rotate;

    const camera = viewport.getCamera();
    const { viewUp, position, focalPoint } = camera;

    const { direction: deltaY } = wheel;

    const [cx, cy, cz] = focalPoint;
    const [ax, ay, az] = direction;

    //Calculate angle in radian as glmatrix rotate is in radian
    const angle = (deltaY * (rotateIncrementDegrees * Math.PI)) / 180;

    // position[3] = 1.0
    // focalPoint[3] = 1.0
    // viewUp[3] = 0.0

    const newPosition: Types.Point3 = [0, 0, 0];
    const newFocalPoint: Types.Point3 = [0, 0, 0];
    const newViewUp: Types.Point3 = [0, 0, 0];

    const transform = mat4.identity(new Float32Array(16));
    mat4.translate(transform, transform, [cx, cy, cz]);
    mat4.rotate(transform, transform, angle, [ax, ay, az]);
    mat4.translate(transform, transform, [-cx, -cy, -cz]);
    vec3.transformMat4(newPosition, position, transform);
    vec3.transformMat4(newFocalPoint, focalPoint, transform);

    mat4.identity(transform);
    mat4.rotate(transform, transform, angle, [ax, ay, az]);
    vec3.transformMat4(<Types.Point3>newViewUp, viewUp, transform);

    viewport.setCamera({
      position: newPosition,
      viewUp: newViewUp,
      focalPoint: newFocalPoint,
    });

    viewport.render();
  }

  /**
   * Allows binding to the mouse wheel for performing stack scrolling.
   */
  _scroll(evt: EventTypes.MouseWheelEventType): void {
    const { wheel, element } = evt.detail;
    const { direction } = wheel;
    const { invert } = this.configuration;
    const { viewport } = getEnabledElement(element);
    const delta = direction * (invert ? -1 : 1);

    scroll(viewport, {
      delta,
      debounceLoading: this.configuration.debounceIfNotLoaded,
      loop: this.configuration.loop,
      volumeId:
        viewport instanceof BaseVolumeViewport
          ? viewport.getVolumeId()
          : undefined,
      scrollSlabs: this.configuration.scrollSlabs,
    });
  }

  _getPixelPerImage(viewport) {
    const { element } = viewport;
    const numberOfSlices = viewport.getNumberOfSlices();

    // The Math.max here makes it easier to mouseDrag-scroll small or really large image stacks
    return Math.max(2, element.offsetHeight / Math.max(numberOfSlices, 8));
  }
}

StackScrollTool.toolName = 'StackScroll';
export default StackScrollTool;
