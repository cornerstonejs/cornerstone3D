import { BaseTool } from './base';
import { getEnabledElement } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import { mat4, vec3 } from 'gl-matrix';
import { PublicToolProps, ToolProps } from '../types';
import { MouseWheelEventType } from '../types/EventTypes';

const DIRECTIONS = {
  X: [1, 0, 0],
  Y: [0, 1, 0],
  Z: [0, 0, 1],
  CUSTOM: [],
};

/**
 * Tool that rotates the camera on mouse wheel.
 * It rotates the camera around the focal point, and around a defined axis. Default
 * axis is set to be Z axis, but it can be configured to any custom normalized axis.
 *
 */
class VolumeRotateMouseWheelTool extends BaseTool {
  static toolName;
  _configuration: any;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        direction: DIRECTIONS.Z,
        rotateIncrementDegrees: 0.5,
      },
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  mouseWheelCallback(evt: MouseWheelEventType) {
    // https://github.com/kitware/vtk-js/blob/HEAD/Sources/Interaction/Manipulators/MouseCameraUnicamRotateManipulator/index.js#L73
    const { element, wheel } = evt.detail;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const { direction, rotateIncrementDegrees } = this.configuration;

    const camera = viewport.getCamera();
    const { viewUp, position, focalPoint } = camera;

    const { direction: deltaY } = wheel;

    const [cx, cy, cz] = focalPoint;
    const [ax, ay, az] = direction;

    const angle = deltaY * rotateIncrementDegrees;

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
}

VolumeRotateMouseWheelTool.toolName = 'VolumeRotateMouseWheel';
export default VolumeRotateMouseWheelTool;
