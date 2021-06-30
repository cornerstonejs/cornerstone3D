import {
  getEnabledElement,
  VolumeViewport,
  StackViewport,
} from '@ohif/cornerstone-render'
import filterViewportsWithFrameOfReferenceUID from './filterViewportsWithFrameOfReferenceUID'
import filterViewportsWithToolEnabled from './filterViewportsWithToolEnabled'
import filterViewportsWithSameOrientation from './filterViewportsWithSameOrientation'

/**
 * @function getViewportUIDsWithToolToRender given a cornerstone3D enabled `element`,
 * and a `toolName`, find all viewportUIDs looking at the same Frame Of Reference that have
 * the tool with the given `toolName` active, passive or enabled.
 *
 * @param {HTMLElement} element The target cornerstone3D enabled element.
 * @param {string} toolName The string toolName.
 * @param {boolean=true} requireSameOrientation If true, only return viewports matching the orientation of the original viewport
 *
 * @returns {string[]} An array of viewportUIDs.
 */
export default function getViewportUIDsWithToolToRender(
  element: HTMLElement,
  toolName: string,
  requireSameOrientation = true
): string[] {
  const enabledElement = getEnabledElement(element)
  const { renderingEngine, FrameOfReferenceUID } = enabledElement

  let viewports = renderingEngine.getViewports()

  viewports = filterViewportsWithFrameOfReferenceUID(
    viewports,
    FrameOfReferenceUID
  )
  viewports = filterViewportsWithToolEnabled(viewports, toolName)

  const viewport = renderingEngine.getViewport(enabledElement.viewportUID)

  if (requireSameOrientation) {
    viewports = filterViewportsWithSameOrientation(
      viewports,
      viewport.getCamera()
    )
  }

  const viewportUIDs = viewports.map((vp) => vp.uid)

  return viewportUIDs
}
