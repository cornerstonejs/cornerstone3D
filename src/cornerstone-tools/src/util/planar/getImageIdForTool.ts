import { metaData } from '@cornerstone'
import { vec3 } from 'gl-matrix'
import math from '../math'
import Point3 from 'src/cornerstone-core/src/types/Point3'
import getSpacingInNormalDirection from './getSpacingInNormalDirection'

export default function getImageIdForTool(
  worldPos: Point3,
  viewPlaneNormal: Point3,
  viewUp: Point3,
  imageVolume
): string {
  const { direction, imageIds } = imageVolume

  // 1. Get ScanAxis vector
  const kVector = direction.slice(6, 9)

  // 2. Check if scanAxis is not parallel to camera viewPlaneNormal
  const dotProducts = vec3.dot(kVector, <vec3>viewPlaneNormal)

  // 2.a if imagePlane is not parallel to the camera: tool is not drawn on an
  // imaging plane, return
  if (Math.abs(dotProducts) < 0.99) {
    return
  }

  // 3. Calculate Spacing the in the normal direction, this will get used to
  // check whether we are withing a slice
  const spacingInNormalDirection = getSpacingInNormalDirection(
    imageVolume,
    viewPlaneNormal
  )

  const halfSpacingInNormalDirection = spacingInNormalDirection / 2

  // 4. Iterate over all imageIds and check if the tool point (worldPos) is
  // withing one of the slices defined by an imageId
  let imageIdForTool
  for (let i = 0; i < imageIds.length; i++) {
    const imageId = imageIds[i]

    // 4.a Get metadata for the imageId
    const { imagePositionPatient } = metaData.get('imagePlaneModule', imageId)

    // 4.b Calculate the direction vector from toolData point to the first voxel
    // of this image defined by imageId
    const dir = vec3.create()
    vec3.sub(dir, worldPos, imagePositionPatient)

    // 4.c Calculate the distance between the vector above and the viewplaneNormal
    // i.e., projected distance
    const dot = vec3.dot(dir, viewPlaneNormal)

    // 4.d If the distance is withing range, return the imageId
    if (Math.abs(dot) < halfSpacingInNormalDirection) {
      imageIdForTool = imageId
    }
  }

  return imageIdForTool
}
