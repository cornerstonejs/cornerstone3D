import type { Types } from '@cornerstonejs/core'

import type { vtkImageData } from 'vtk.js/Sources/Common/DataModel/ImageData'
import { vec3 } from 'gl-matrix'
import { pointInSphere } from './math/sphere'
import { getBoundingBoxAroundShape } from './segmentation/getBoundingBoxUtils'
import pointInShapeCallback, {
  PointInShapeCallback,
} from './pointInShapeCallback'
import transformPhysicalToIndex from './transformPhysicalToIndex'

// Todo: I *think* this can be done without the need to access viewport's camera
// since sphere's center circle can be in any plane as long as its center
// is the center of the sphere ..

/**
 * Given a viewport, an imageData, and a circle points in the viewport, it will
 * run the callback for each point in sphere whose great circle (biggest circle
 * that can be drawn chopping a sphere) is the provided circle points.
 *
 * @param viewport - VolumeViewport
 * @param imageData - The volume imageData
 * @param circlePoints - [Types.Point3, Types.Point3]
 * @param callback - A callback function that will be called for each point in the shape.
 */
export default function pointInSurroundingSphereCallback(
  viewport: Types.IVolumeViewport,
  imageData: vtkImageData,
  circlePoints: [Types.Point3, Types.Point3],
  callback: PointInShapeCallback
): void {
  const dimensions = imageData.getDimensions() as Types.Point3
  const camera = viewport.getCamera()

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

  // Put the sphere's center on the middle of the drawn circle
  const sphereCenterWorld = vec3.fromValues(
    (bottom[0] + top[0]) / 2,
    (bottom[1] + top[1]) / 2,
    (bottom[2] + top[2]) / 2
  )

  // Drawn radius of the circle in the world
  const radiusWorld = vec3.distance(bottom, top) / 2

  // we need to find the bounding box of the sphere in the image, e.g., the
  // topLeftWorld and bottomRightWorld points of the bounding box.
  // We go from the sphereCenter in the normal direction of amount radius, and
  // we go left to find the topLeftWorld point of the bounding box. Next we go
  // in the opposite direction and go right to find the bottomRightWorld point
  // of the bounding box.
  const topLeftWorld = vec3.create()
  const bottomRightWorld = vec3.create()

  vec3.scaleAndAdd(topLeftWorld, top, viewPlaneNormal, radiusWorld)
  vec3.scaleAndAdd(bottomRightWorld, bottom, viewPlaneNormal, -radiusWorld)

  // go in the direction of viewRight with the value of radius
  vec3.scaleAndAdd(topLeftWorld, topLeftWorld, viewRight, -radiusWorld)
  vec3.scaleAndAdd(bottomRightWorld, bottomRightWorld, viewRight, radiusWorld)

  // convert the world coordinates to index coordinates

  const sphereCornersIJK = [
    <Types.Point3>transformPhysicalToIndex(imageData, topLeftWorld),
    <Types.Point3>transformPhysicalToIndex(imageData, bottomRightWorld),
  ]

  // get the bounding box of the sphere in the image
  const boundsIJK = getBoundingBoxAroundShape(sphereCornersIJK, dimensions)

  const sphereObj = {
    center: sphereCenterWorld,
    radius: radiusWorld,
  }

  pointInShapeCallback(
    imageData,
    (pointLPS) => pointInSphere(sphereObj, pointLPS),
    callback,
    boundsIJK
  )
}
