import { vec3 } from 'gl-matrix'
import { Point3 } from '../../../types'

type Ellipse = {
  center: Point3 | vec3
  xRadius: number
  yRadius: number
  zRadius: number
}

export default function pointInEllipse(
  ellipse: Ellipse,
  pointLPS: Point3
): boolean {
  const { center: circleCenterWorld, xRadius, yRadius, zRadius } = ellipse
  const [x, y, z] = pointLPS
  const [x0, y0, z0] = circleCenterWorld

  let inside = 0
  if (xRadius !== 0) {
    inside += ((x - x0) * (x - x0)) / (xRadius * xRadius)
  }

  if (yRadius !== 0) {
    inside += ((y - y0) * (y - y0)) / (yRadius * yRadius)
  }

  if (zRadius !== 0) {
    inside += ((z - z0) * (z - z0)) / (zRadius * zRadius)
  }

  return inside <= 1
}
