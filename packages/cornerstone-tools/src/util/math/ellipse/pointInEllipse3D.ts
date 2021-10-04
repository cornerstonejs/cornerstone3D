import { Point3 } from '../../../types'

export default function pointInEllipse3D(
  ellipse,
  pointIJK: Point3,
  pointLPS: Point3,
  viewPlane: Point3
): boolean {
  const { center: circleCenterWorld, xRadius, yRadius } = ellipse
  const [n1, n2, n3] = viewPlane
  const [i, j, k] = pointIJK
  const [x, y, z] = pointLPS
  const [x0, y0, z0] = circleCenterWorld

  const radius = Math.sqrt(xRadius * xRadius + yRadius + yRadius)

  const inside =
    (x - x0) * (x - x0) + (y - y0) * (y - y0) + (z - z0) * (z - z0) <=
    radius * radius

  // Todo: onPlane should be used for oblique planes brushing, but doesn't work right now for some reason
  // const onPlane =
  //   Math.abs(n1 * (x - x0) + n2 * (y - y0) + n3 * (z - z0)) <= 1e-3

  // console.debug(Math.abs(n1 * (x - x0) + n2 * (y - y0) + n3 * (z - z0)))
  return inside
}
