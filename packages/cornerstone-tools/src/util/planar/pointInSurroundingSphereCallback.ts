import {
  Point3,
  IImageVolume,
  IEnabledElement,
} from '@ohif/cornerstone-render/src/types'

import { vec3 } from 'gl-matrix'
import { getSpacingInNormalDirection } from '.'
import { getCanvasEllipseCorners, pointInEllipse } from '../math/ellipse'
import { getBoundingBoxAroundShape } from '../segmentation'
import pointInShapeCallback, {
  PointInShapeCallback,
} from './pointInShapeCallback'

function worldToIndex(imageData, ain) {
  const vout = vec3.fromValues(0, 0, 0)
  imageData.worldToIndex(ain, vout)
  return vout
}

type PartialCamera = {
  viewUp: Point3
  viewPlaneNormal: Point3
}

/**
 * It performs a callback function (given) on the points that are inside the surrounding
 * sphere
 */
export default function pointInSurroundingSphereCallback(
  enabledElement: IEnabledElement,
  volume: IImageVolume,
  camera: PartialCamera,
  circlePoints: any,
  callback: PointInShapeCallback
): void {
  const { vtkImageData, scalarData, dimensions } = volume
  const { viewport } = enabledElement

  // Calculate viewRight from the camera, this will get used in order to
  // calculate circles topLeft and bottomRight on different planes of intersection
  // between sphere and viewPlane
  const viewUp = vec3.fromValues(
    camera.viewUp[0],
    camera.viewUp[1],
    camera.viewUp[2]
  )
  const viewPlaneNormal = vec3.fromValues(
    camera.viewPlaneNormal[0],
    camera.viewPlaneNormal[1],
    camera.viewPlaneNormal[2]
  )
  let viewRight = vec3.create()

  vec3.cross(viewRight, viewUp, viewPlaneNormal)
  viewRight = [-viewRight[0], -viewRight[1], -viewRight[2]]

  const [bottom, top] = circlePoints

  // Todo: fix this with vec3
  // Drawn radius of the circle in the world
  const radiusWorld =
    Math.sqrt(
      Math.abs(bottom[0] - top[0]) ** 2 +
        Math.abs(bottom[1] - top[1]) ** 2 +
        Math.abs(bottom[2] - top[2]) ** 2
    ) / 2

  // Spacing in normal direction, this will get used to move the viewPlane along the
  // direction of projection and intersect with the sphere
  const spacing = getSpacingInNormalDirection(volume, <Point3>viewPlaneNormal)

  // Put the sphere's center on the middle of the drawn circle
  const sphereCenterWorld = vec3.fromValues(
    (bottom[0] + top[0]) / 2,
    (bottom[1] + top[1]) / 2,
    (bottom[2] + top[2]) / 2
  )

  /**
   * 1. For loop over +/- of the direction of projection with the spacing
   * equal to spacing in the normal direction to compute new viewPlanes (this plane
   * will get intersected to the sphere)
   *
   * 2. Calculate the new circle center (intersection of the sphere and the new
   * viewPlane)
   *
   * 3. Calculate the new radius for the intersected circle
   *
   * 4. Calculate the circle topLeft and bottomRight based on the camera viewUp
   * and viewRight and the new radius
   *
   * 5. Convert them to canvas coordinates. IMPORTANT: since viewport will give
   * the world coordinates based on the current image, we need to modify it based
   * on the new viewPlane
   *
   * 6. Come up with the ellipse(circle) equation in the canvas coords
   *
   * 7. Use pointInShapeCallback to update the labelmap
   */

  for (
    let distance = -radiusWorld;
    distance <= radiusWorld;
    distance = distance + spacing
  ) {
    const newCenterWorld = vec3.create()

    vec3.scaleAndAdd(
      newCenterWorld,
      sphereCenterWorld,
      viewPlaneNormal,
      distance
    )

    const rad = Math.sqrt(radiusWorld ** 2 - distance ** 2)

    // Find the top, left, bottom, right of the circle in world
    const newTopWorld = vec3.create()
    const newBottomWorld = vec3.create()
    const newLeftWorld = vec3.create()
    const newRightWorld = vec3.create()
    vec3.scaleAndAdd(newTopWorld, newCenterWorld, viewUp, rad)
    vec3.scaleAndAdd(newBottomWorld, newCenterWorld, viewUp, -rad)
    vec3.scaleAndAdd(newLeftWorld, newCenterWorld, viewRight, -rad)
    vec3.scaleAndAdd(newRightWorld, newCenterWorld, viewRight, rad)

    let normalPlaneIndex = -1
    for (let index = 0; index <= 2; index++) {
      const _worlds = [
        newTopWorld[index],
        newBottomWorld[index],
        newLeftWorld[index],
        newRightWorld[index],
      ]
      if (_worlds.every((v) => v === _worlds[0])) {
        normalPlaneIndex = index
      }
    }

    // Convert top,left, bottom, right to canvas
    const newTopCanvas = viewport.worldToCanvas(<Point3>newTopWorld)
    const newBottomCanvas = viewport.worldToCanvas(<Point3>newBottomWorld)
    const newLeftCanvas = viewport.worldToCanvas(<Point3>newLeftWorld)
    const newRightCanvas = viewport.worldToCanvas(<Point3>newRightWorld)

    // (circle) topLeft and bottomRight corners in canvas coordinates
    const [topLeftCanvas, bottomRightCanvas] = getCanvasEllipseCorners([
      newBottomCanvas,
      newTopCanvas,
      newLeftCanvas,
      newRightCanvas,
    ])

    // Todo: fix this
    if (
      isNaN(topLeftCanvas[0]) ||
      isNaN(topLeftCanvas[0]) ||
      isNaN(bottomRightCanvas[0]) ||
      isNaN(bottomRightCanvas[0])
    ) {
      break
    }

    const ellipse = {
      left: Math.min(topLeftCanvas[0], bottomRightCanvas[0]),
      top: Math.min(topLeftCanvas[1], bottomRightCanvas[1]),
      width: Math.abs(topLeftCanvas[0] - bottomRightCanvas[0]),
      height: Math.abs(topLeftCanvas[1] - bottomRightCanvas[1]),
    }

    // Find the extent of the ellipse (circle) in IJK index space of the image
    // Not: the following will cause a problem if viewport is not at the slice that
    // the circle is draw. For instance if we are running pointInSurroundingSphereCallback 10 slices down
    // canvasToWorld should take into account the corrent slice rendering and the
    // slices that will get intersected with the sphere (that doesn't center on the current slice)
    const topLeftWorld = viewport.canvasToWorld(topLeftCanvas)
    const bottomRightWorld = viewport.canvasToWorld(bottomRightCanvas)

    // Important: Modify the current world since viewport doesn't take into account
    // we want the world not in current slice the viewport is showing
    const newTopLeftWorld = vec3.create()
    const newBottomRightWorld = vec3.create()

    vec3.scaleAndAdd(newTopLeftWorld, topLeftWorld, viewPlaneNormal, distance)
    vec3.scaleAndAdd(
      newBottomRightWorld,
      bottomRightWorld,
      viewPlaneNormal,
      distance
    )

    if (normalPlaneIndex === -1) {
      throw new Error('oblique plane')
    }

    // Todo: temporary fix, All this logic should be in the world space not canvas
    newTopLeftWorld[normalPlaneIndex] = newTopWorld[normalPlaneIndex]
    newBottomRightWorld[normalPlaneIndex] = newBottomWorld[normalPlaneIndex]

    const ellipsoidCornersIJK = [
      <Point3>worldToIndex(vtkImageData, newTopLeftWorld),
      <Point3>worldToIndex(vtkImageData, newBottomRightWorld),
    ]

    const boundsIJK = getBoundingBoxAroundShape(ellipsoidCornersIJK, dimensions)

    if (boundsIJK.every(([min, max]) => min !== max)) {
      throw new Error('Oblique segmentation tools are not supported yet')
    }

    pointInShapeCallback(
      boundsIJK,
      viewport.worldToCanvas,
      scalarData,
      vtkImageData,
      dimensions,
      (canvasCoords) => pointInEllipse(ellipse, canvasCoords),
      callback
    )
  }
}
