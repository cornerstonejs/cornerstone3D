import { getLabelmapsStateForElement } from './state'
import { getActiveLabelmapIndex } from './activeLabelmapController'

/**
 * Returns all the labelmapUIDs of the HTML element (active and inactive)
 * @param element HTML element
 * @returns
 */
function getLabelmapUIDsForElement(element: HTMLElement): string[] {
  const viewportLabelmapsState = getLabelmapsStateForElement(element)

  if (!viewportLabelmapsState) {
    return []
  }

  return viewportLabelmapsState.labelmaps.map(({ volumeUID }) => volumeUID)
}

/**
 * Returns the labelmapUID that the element is rendering, if no labelmapIndex is
 * provided it uses the active labelmapIndex
 * @param element HTML Element
 * @param labelmapIndex labelmap index in the viewportLabelmapsState
 * @returns labelmapUID
 */
function getLabelmapUIDForElement(
  element: HTMLElement,
  labelmapIndex?: number
): string | undefined {
  const viewportLabelmapsState = getLabelmapsStateForElement(element)

  if (!viewportLabelmapsState) {
    return
  }

  const index =
    labelmapIndex === undefined
      ? getActiveLabelmapIndex(element)
      : labelmapIndex

  return viewportLabelmapsState.labelmaps[index].volumeUID
}

export { getLabelmapUIDsForElement, getLabelmapUIDForElement }
