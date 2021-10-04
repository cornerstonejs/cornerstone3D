import { vtkImageData } from 'vtk.js/Sources/Common/DataModel/ImageData'

export default function getBoundingBoxAroundShape(
  vertices: number[],
  vtkImageData: vtkImageData
): [number, number][] {
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
    [xMin, xMax],
    [yMin, yMax],
    [zMin, zMax],
  ]
}
