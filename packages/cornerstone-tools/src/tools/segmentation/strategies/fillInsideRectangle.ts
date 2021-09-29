import { Viewport, cache, ImageVolume } from '@ohif/cornerstone-render'
import { IEnabledElement } from 'cornerstone-render/src/types'
import { vec3 } from 'gl-matrix'
import vtkPaintFilter from 'vtk.js/Sources/Filters/General/PaintFilter'
import { Point3 } from '../../../types'

type OperationData = {
  points: [Point3, Point3, Point3, Point3]
  labelmap: ImageVolume
  segmentIndex: number
}

type FillRectangleEvent = {
  enabledElement: IEnabledElement
}

/**
 * FillInsideRectangle - Fill all pixels inside/outside the region defined
 * by the rectangle.
 * @param  {} evt The Cornerstone event.
 * @param {}  operationData An object containing the `pixelData` to
 *                          modify, the `segmentIndex` and the `points` array.
 * @returns {null}
 */
function fillRectangle(
  evt: FillRectangleEvent,
  operationData: OperationData,
  inside = true
): void {
  const { labelmap, points, segmentIndex } = operationData

  const { enabledElement } = evt
  const { renderingEngine } = enabledElement

  const { vtkImageData, dimensions } = labelmap

  // Values to modify
  const values = vtkImageData.getPointData().getScalars().getData()
  // const spacingToUse = Math.min(...spacing)

  const rectangleCornersIJK: Point3[] = points.map((world) => {
    return vtkImageData.worldToIndex(world)
  })

  const [[xMin, yMin], [xMax, yMax], [zMin, zMax]] =
    getBoundingBoxAroundPolygon(rectangleCornersIJK, vtkImageData)

  // Todo: this doesn't support oblique or sagittal or coronal for now or rectangles that are not drawn from top left to bottom right
  // Todo: only handle ijk , and throw for oblique
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) {
      for (let z = zMin; z <= zMax; z++) {
        const offset = vtkImageData.computeOffsetIndex([x, y, z])
        if (values[offset] === 1) {
          continue
        }
        values[offset] = segmentIndex
      }
    }
  }

  for (let i = 0; i < dimensions[2]; i++) {
    labelmap.vtkOpenGLTexture.setUpdatedFrame(i)
  }

  vtkImageData.getPointData().getScalars().setData(values)
  vtkImageData.modified()

  // todo: this renders all viewports, only renders viewports that have the modified labelmap actor
  // right now this is needed to update the labelmap on other viewports that have it (pt)
  renderingEngine.render()

  // inside
  //   ? fillInsideShape(evt, operationData, () => true, topLeft, bottomRight)
  //   : fillOutsideBoundingBox(evt, operationData, topLeft, bottomRight)
}

export default function getBoundingBoxAroundPolygon(vertices, vtkImageData) {
  let xMin = Infinity
  let xMax = 0
  let yMin = Infinity
  let yMax = 0
  let zMin = Infinity
  let zMax = 0
  const [width, height, depth] = vtkImageData.getDimensions()

  vertices.forEach((v) => {
    xMin = Math.min(v[0], xMin)
    xMax = Math.max(v[0], xMax)
    yMin = Math.min(v[1], yMin)
    yMax = Math.max(v[1], yMax)
    zMin = Math.min(v[2], zMin)
    zMax = Math.max(v[2], zMax)
  })

  xMin = Math.floor(xMin)
  xMax = Math.floor(xMax)
  yMin = Math.floor(yMin)
  yMax = Math.floor(yMax)
  zMin = Math.floor(zMin)
  zMax = Math.floor(zMax)

  xMin = Math.max(0, xMin)
  xMax = Math.min(width, xMax)
  yMin = Math.max(0, yMin)
  yMax = Math.min(height, yMax)
  zMin = Math.max(0, zMin)
  zMax = Math.min(depth, zMax)

  return [
    [xMin, yMin],
    [xMax, yMax],
    [zMin, zMax],
  ]
}

/**
 * Fill all pixels inside/outside the region defined by the rectangle.
 * @param  {} evt The Cornerstone event.
 * @param {}  operationData An object containing the `pixelData` to
 *                          modify, the `segmentIndex` and the `points` array.
 * @returns {null}
 */
export function fillInsideRectangle(
  evt: FillRectangleEvent,
  operationData: OperationData
): void {
  fillRectangle(evt, operationData, true)
}

/**
 * Fill all pixels outside the region defined by the rectangle.
 * @param  {} evt The Cornerstone event.
 * @param  {} operationData An object containing the `pixelData` to
 *                          modify, the `segmentIndex` and the `points` array.
 * @returns {null}
 */
export function fillOutsideRectangle(
  evt: FillRectangleEvent,
  operationData: OperationData
): void {
  fillRectangle(evt, operationData, false)
}
