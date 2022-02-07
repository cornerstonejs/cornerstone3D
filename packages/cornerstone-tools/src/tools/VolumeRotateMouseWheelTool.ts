import { BaseTool } from './base'
import { getEnabledElement, Types } from '@precisionmetrics/cornerstone-render'
import { mat4, vec3 } from 'gl-matrix'

const DIRECTIONS = {
  X: [1, 0, 0],
  Y: [0, 1, 0],
  Z: [0, 0, 1],
  CUSTOM: [],
}

/**
 * @class VolumeRotateMouseWheelTool
 * @classdesc Tool that rotates the camera on mouse wheel.
 * It rotates the camera around the focal point, and around a defined axis. Default
 * axis is set to be Z axis, but it can be configured to any custom normalized axis.
 *
 * @export
 * @class VolumeRotateMouseWheelTool
 * @extends {BaseTool}
 */
export default class VolumeRotateMouseWheelTool extends BaseTool {
  _configuration: any

  constructor(toolConfiguration = {}) {
    const defaultToolConfiguration = {
      name: 'VolumeRotateMouseWheel',
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        direction: DIRECTIONS.Z,
        rotateIncrementDegrees: 20,
      },
    }

    super(toolConfiguration, defaultToolConfiguration)
  }

  // https://github.com/kitware/vtk-js/blob/HEAD/Sources/Interaction/Manipulators/MouseCameraUnicamRotateManipulator/index.js#L73
  mouseWheelCallback(evt) {
    const { element, wheel } = evt.detail
    const enabledElement = getEnabledElement(element)
    const { viewport } = enabledElement
    const { direction, rotateIncrementDegrees } = this.configuration

    const camera = viewport.getCamera()
    const { viewUp, position, focalPoint } = camera

    const { direction: deltaY } = wheel

    const [cx, cy, cz] = focalPoint
    const [ax, ay, az] = direction

    const angle = deltaY * rotateIncrementDegrees

    // position[3] = 1.0
    // focalPoint[3] = 1.0
    // viewUp[3] = 0.0

    const newPosition: Types.Point3 = [0, 0, 0]
    const newFocalPoint: Types.Point3 = [0, 0, 0]
    const newViewUp: Types.Point3 = [0, 0, 0]

    const transform = mat4.identity(new Float32Array(16))
    mat4.translate(transform, transform, [cx, cy, cz])
    mat4.rotate(transform, transform, angle, [ax, ay, az])
    mat4.translate(transform, transform, [-cx, -cy, -cz])
    vec3.transformMat4(newPosition, position, transform)
    vec3.transformMat4(newFocalPoint, focalPoint, transform)

    mat4.identity(transform)
    mat4.rotate(transform, transform, angle, [ax, ay, az])
    vec3.transformMat4(<Types.Point3>newViewUp, viewUp, transform)

    viewport.setCamera({
      position: newPosition,
      viewUp: newViewUp,
      focalPoint: newFocalPoint,
    })

    viewport.render()
  }
}
