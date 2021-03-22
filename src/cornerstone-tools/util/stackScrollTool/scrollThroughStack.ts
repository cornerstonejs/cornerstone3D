import { getEnabledElement } from '@cornerstone'
import getTargetVolume from '../planar/getTargetVolume'
import getSliceRange from './getSliceRange'
import snapFocalPointToSlice from './snapFocalPointToSlice'

/**
 * @function scrollThroughStack Scroll the stack defined by the event (`evt`)
 * and volume with `volumeUID` `deltaFrames number of frames`.
 * Frames are defined as increasing in the view direction.
 *
 * @param {CustomEvent} evt The event corresponding to an interaction with a
 * specific viewport.
 * @param {number} deltaFrames The number of frames to jump through.
 * @param {string} volumeUID The `volumeUID` of the volume to scroll through
 * on the viewport.
 */
export default function scrollThroughStack(evt, deltaFrames, volumeUID) {
  const { element: canvas } = evt.detail
  const enabledElement = getEnabledElement(canvas)
  const { scene, viewport } = enabledElement
  const camera = viewport.getCamera()
  const { focalPoint, viewPlaneNormal, position } = camera

  // Stack scroll across highest resolution volume.
  const { spacingInNormalDirection, imageVolume } = getTargetVolume(
    scene,
    camera,
    volumeUID
  )

  const volumeActor = scene.getVolumeActor(imageVolume.uid)
  const scrollRange = getSliceRange(volumeActor, viewPlaneNormal, focalPoint)

  const { newFocalPoint, newPosition } = snapFocalPointToSlice(
    focalPoint,
    position,
    scrollRange,
    viewPlaneNormal,
    spacingInNormalDirection,
    deltaFrames
  )

  enabledElement.viewport.setCamera({
    focalPoint: newFocalPoint,
    position: newPosition,
  })
  enabledElement.viewport.render()
}
