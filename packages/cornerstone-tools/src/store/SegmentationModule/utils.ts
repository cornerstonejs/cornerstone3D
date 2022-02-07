import { getLabelmapsStateForElement } from './state'
import { getActiveLabelmapIndex } from '.'

/**
 * Returns all the labelmapUIDs of the HTML element (active and inactive)
 * @param canvas HTML canvas
 * @returns
 */
function getLabelmapUIDsForElement(canvas: HTMLCanvasElement): string[] {
  const viewportLabelmapsState = getLabelmapsStateForElement(canvas)

  if (!viewportLabelmapsState) {
    return []
  }

  return viewportLabelmapsState.labelmaps.map(({ volumeUID }) => volumeUID)
}

/**
 * Returns the labelmapUID that the element is rendering, if no labelmapIndex is
 * provided it uses the active labelmapIndex
 * @param canvas HTMLCanvasElement
 * @param labelmapIndex labelmap index in the viewportLabelmapsState
 * @returns labelmapUID
 */
function getLabelmapUIDForElement(
  canvas: HTMLCanvasElement,
  labelmapIndex?: number
): string | undefined {
  const viewportLabelmapsState = getLabelmapsStateForElement(canvas)

  if (!viewportLabelmapsState) {
    return
  }

  const index =
    labelmapIndex === undefined ? getActiveLabelmapIndex(canvas) : labelmapIndex

  return viewportLabelmapsState.labelmaps[index].volumeUID
}

export { getLabelmapUIDsForElement, getLabelmapUIDForElement }
