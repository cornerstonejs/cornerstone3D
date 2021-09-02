import {
  getEnabledElement,
  StackViewport,
  VolumeViewport,
} from '@ohif/cornerstone-render'
import clip from '../clip'
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
 * @param {boolean} invert inversion of the scrolling
 * on the viewport.
 */
export default function scrollThroughStack(
  evt,
  deltaFrames: number,
  volumeUID: string,
  invert = false
) {
  const { element: canvas, wheel } = evt.detail
  const { scene, viewport } = getEnabledElement(canvas)
  const { type: viewportType } = viewport
  const camera = viewport.getCamera()
  const { focalPoint, viewPlaneNormal, position } = camera

  if (viewport instanceof StackViewport) {
    // stack viewport
    const currentImageIdIndex = viewport.getCurrentImageIdIndex()
    const numberOfFrames = viewport.getImageIds().length
    const { direction } = wheel
    const stackDirection = invert ? -direction : direction
    let newImageIdIndex = currentImageIdIndex + stackDirection
    newImageIdIndex = clip(newImageIdIndex, 0, numberOfFrames - 1)

    viewport.setImageIdIndex(newImageIdIndex)
  } else if (viewport instanceof VolumeViewport) {
    // Stack scroll across highest resolution volume.
    const { spacingInNormalDirection, imageVolume } = getTargetVolume(
      scene,
      camera,
      volumeUID
    )

    if (!imageVolume) {
      return
    }

    const volumeActor = scene.getVolumeActor(imageVolume.uid)
    const scrollRange = getSliceRange(volumeActor, viewPlaneNormal, focalPoint)

    const delta = invert ? -deltaFrames : deltaFrames

    const { newFocalPoint, newPosition } = snapFocalPointToSlice(
      focalPoint,
      position,
      scrollRange,
      viewPlaneNormal,
      spacingInNormalDirection,
      delta
    )

    viewport.setCamera({
      focalPoint: newFocalPoint,
      position: newPosition,
    })
    viewport.render()
  } else {
    throw new Error(`Not implemented for Viewport Type: ${viewportType}`)
  }
}
