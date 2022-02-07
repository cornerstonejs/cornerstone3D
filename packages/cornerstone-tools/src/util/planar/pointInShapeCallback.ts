import { Point3, Point2 } from '@precisionmetrics/cornerstone-render/src/types'
import { vec2, vec3 } from 'gl-matrix'

export type PointInShapeCallback = (
  canvasCoords: Point2,
  _pointIJK: Point3,
  index: number,
  value: number
) => void

/**
 *
 */
export default function pointInShapeCallback(
  boundsIJK: [Point2, Point2, Point2],
  worldToCanvas: (world: Point3 | vec3) => any,
  scalarData,
  imageData,
  dimensions: Point3,
  pointInShapeFn,
  callback: PointInShapeCallback
) {
  const [[iMin, iMax], [jMin, jMax], [kMin, kMax]] = boundsIJK

  const start = vec3.fromValues(iMin, jMin, kMin)

  const worldPosStart = vec3.create()
  imageData.indexToWorldVec3(start, worldPosStart)
  const canvasPosStart = worldToCanvas(worldPosStart)

  const startPlusI = vec3.fromValues(iMin + 1, jMin, kMin)
  const startPlusJ = vec3.fromValues(iMin, jMin + 1, kMin)
  const startPlusK = vec3.fromValues(iMin, jMin, kMin + 1)

  const worldPosStartPlusI = vec3.create()
  const plusICanvasDelta = vec2.create()
  imageData.indexToWorldVec3(startPlusI, worldPosStartPlusI)
  const canvasPosStartPlusI = worldToCanvas(worldPosStartPlusI)
  vec2.sub(plusICanvasDelta, canvasPosStartPlusI, canvasPosStart)

  const worldPosStartPlusJ = vec3.create()
  const plusJCanvasDelta = vec2.create()
  imageData.indexToWorldVec3(startPlusJ, worldPosStartPlusJ)
  const canvasPosStartPlusJ = worldToCanvas(worldPosStartPlusJ)
  vec2.sub(plusJCanvasDelta, canvasPosStartPlusJ, canvasPosStart)

  const worldPosStartPlusK = vec3.create()
  const plusKCanvasDelta = vec2.create()
  imageData.indexToWorldVec3(startPlusK, worldPosStartPlusK)
  const canvasPosStartPlusK = worldToCanvas(worldPosStartPlusK)
  vec2.sub(plusKCanvasDelta, canvasPosStartPlusK, canvasPosStart)

  const yMultiple = dimensions[0]
  const zMultiple = dimensions[0] * dimensions[1]
  // Calling worldToCanvas on voxels all the time is super slow,
  // So we instead work out the change in canvas position incrementing each index causes.

  // This is a triple loop, but one of these 3 values will be constant
  // In the planar view.
  for (let k = kMin; k <= kMax; k++) {
    for (let j = jMin; j <= jMax; j++) {
      for (let i = iMin; i <= iMax; i++) {
        const dI = i - iMin
        const dJ = j - jMin
        const dK = k - kMin

        let canvasCoords = [canvasPosStart[0], canvasPosStart[1]]

        canvasCoords = [
          canvasCoords[0] +
            plusICanvasDelta[0] * dI +
            plusJCanvasDelta[0] * dJ +
            plusKCanvasDelta[0] * dK,
          canvasCoords[1] +
            plusICanvasDelta[1] * dI +
            plusJCanvasDelta[1] * dJ +
            plusKCanvasDelta[1] * dK,
        ]

        if (pointInShapeFn(canvasCoords)) {
          const index = k * zMultiple + j * yMultiple + i
          const value = scalarData[index]

          callback(canvasCoords, [i, j, k], index, value)
        }
      }
    }
  }
}
