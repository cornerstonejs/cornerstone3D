import { getEnabledElement } from '@cornerstonejs/core';
import filterViewportsWithFrameOfReferenceUID from './filterViewportsWithFrameOfReferenceUID';
import filterViewportsWithToolEnabled from './filterViewportsWithToolEnabled';
import filterViewportsWithSameOrientation from './filterViewportsWithSameOrientation';

/**
 * Given a cornerstone3D enabled `element`, and a `toolName`, find all viewportIds
 * looking at the same Frame Of Reference that have the tool with the given `toolName`
 * active, passive or enabled.
 *
 * @param element - The target cornerstone3D enabled element.
 * @param toolName - The string toolName.
 * @param requireSameOrientation - If true, only return viewports matching the orientation of the original viewport
 *
 * @returns An array of viewportIds.
 */
export default function getViewportIdsWithToolToRender(
  element: HTMLDivElement,
  toolName: string,
  requireSameOrientation = true
): string[] {
  const enabledElement = getEnabledElement(element);
  const { renderingEngine, FrameOfReferenceUID } = enabledElement;

  let viewports = renderingEngine.getViewports();

  viewports = filterViewportsWithFrameOfReferenceUID(
    viewports,
    FrameOfReferenceUID
  );
  viewports = filterViewportsWithToolEnabled(viewports, toolName);

  const viewport = renderingEngine.getViewport(enabledElement.viewportId);

  if (requireSameOrientation) {
    viewports = filterViewportsWithSameOrientation(
      viewports,
      viewport.getCamera()
    );
  }

  const viewportIds = viewports.map((vp) => vp.id);

  return viewportIds;
}
