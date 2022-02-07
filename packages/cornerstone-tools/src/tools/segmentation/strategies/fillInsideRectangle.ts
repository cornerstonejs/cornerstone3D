import { Viewport, cache } from '@ohif/cornerstone-render'
import vtkPaintFilter from 'vtk.js/Sources/Filters/General/PaintFilter'

/**
 * FillInsideRectangle - Fill all pixels inside/outside the region defined
 * by the rectangle.
 * @param  {} evt The Cornerstone event.
 * @param {}  operationData An object containing the `pixelData` to
 *                          modify, the `segmentIndex` and the `points` array.
 * @returns {null}
 */
function fillRectangle(evt, operationData, inside = true) {
  const { labelmapUID, points } = operationData

  const {
    enabledElement: { viewport },
  } = evt.detail

  const labelmap = cache.getVolume(labelmapUID)

  const values = labelmap.vtkImageData.getPointData().getScalars().getData()

  const { spacing, vtkImageData } = labelmap
  const spacingToUse = Math.min(...spacing)

  const [xMin, yMin, zMin] = points[0]
  const [xMax, yMax, zMax] = points[3]
  const z = zMin
  // Todo: this doesn't support oblique or sagittal or coronal for now or rectangles that are not drawn from top left to bottom right

  for (let x = xMin; x < xMax; x = x + spacingToUse) {
    for (let y = yMin; y < yMax; y = y + spacingToUse) {
      const offset = vtkImageData.getOffsetIndexFromWorld([x, y, z])
      values[offset] = 1
    }
  }

  // counts = {}
  // for (const num of values) {
  //   counts[num] = counts[num] ? counts[num] + 1 : 1
  // }
  // console.debug('counts after: ', counts)

  // console.debug('before', vtkImageData.getMTime())
  vtkImageData.getPointData().getScalars().setData(values)
  vtkImageData.modified()

  const actors = viewport.getActors()
  actors.forEach(({ volumeActor }) => {
    volumeActor.modified()
    volumeActor.getMapper().modified()
    // volumeActor.getMapper().getScalarTexture().modified()
  })
  labelmap.vtkImageData.modified()
  labelmap.vtkImageData.getPointData().modified()
  labelmap.vtkImageData.getPointData().getScalars().modified()
  labelmap.vtkOpenGLTexture.modified()
  // console.debug('after', vtkImageData.getMTime())
  viewport.render()

  // inside
  //   ? fillInsideShape(evt, operationData, () => true, topLeft, bottomRight)
  //   : fillOutsideBoundingBox(evt, operationData, topLeft, bottomRight)
}

/**
 * Fill all pixels inside/outside the region defined by the rectangle.
 * @param  {} evt The Cornerstone event.
 * @param {}  operationData An object containing the `pixelData` to
 *                          modify, the `segmentIndex` and the `points` array.
 * @returns {null}
 */
export function fillInsideRectangle(evt, operationData) {
  fillRectangle(evt, operationData, true)
}

/**
 * Fill all pixels outside the region defined by the rectangle.
 * @param  {} evt The Cornerstone event.
 * @param  {} operationData An object containing the `pixelData` to
 *                          modify, the `segmentIndex` and the `points` array.
 * @returns {null}
 */
export function fillOutsideRectangle(evt, operationData) {
  fillRectangle(evt, operationData, false)
}
