import { vec3 } from 'gl-matrix'
import { Utilities as csUtils } from '@precisionmetrics/cornerstone-render'
import type { Types } from '@precisionmetrics/cornerstone-render'
import { ToolSpecificToolState, ToolSpecificToolData } from '../../types'

/**
 * given some `ToolSpecificToolState`, and the slice defined by the camera's normal
 * direction and the spacing in the normal, filter the `ToolSpecificToolState` which
 * is within the slice.
 *
 * @param toolState - ToolSpecificToolState
 * @param camera - The camera
 * @param spacingInNormalDirection - The spacing in the normal direction
 * @returns The filtered `ToolSpecificToolState`.
 */
export default function filterToolStateWithinSlice(
  toolState: ToolSpecificToolState,
  camera: Types.ICamera,
  spacingInNormalDirection: number
): ToolSpecificToolState {
  const { viewPlaneNormal } = camera
  const toolStateWithSameNormal = toolState.filter(
    (td: ToolSpecificToolData) => {
      const toolDataViewPlaneNormal = td.metadata.viewPlaneNormal
      return csUtils.isEqual(toolDataViewPlaneNormal, viewPlaneNormal)
    }
  )

  // No in plane toolState.
  if (!toolStateWithSameNormal.length) {
    return []
  }

  // ToolData should be within the slice, which means that it should be between
  // camera's focalPoint +/- spacingInNormalDirection.

  const halfSpacingInNormalDirection = spacingInNormalDirection / 2
  const { focalPoint } = camera

  const toolStateWithinSlice = []

  for (const toolData of toolStateWithSameNormal) {
    const data = toolData.data
    const point = data.handles.points[0]

    // A = point
    // B = focal point
    // P = normal

    // B-A dot P  => Distance in the view direction.
    // this should be less than half the slice distance.

    const dir = vec3.create()

    vec3.sub(dir, focalPoint, point)

    const dot = vec3.dot(dir, viewPlaneNormal)

    if (Math.abs(dot) < halfSpacingInNormalDirection) {
      toolStateWithinSlice.push(toolData)
    }
  }

  return toolStateWithinSlice
}
