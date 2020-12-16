import { getEnabledElement } from '../../../index';
import filterViewportsWithFrameOfReferenceUID from './filterViewportsWithFrameOfReferenceUID';
import filterViewportsWithToolEnabled from './filterViewportsWithToolEnabled';

export default function getViewportUIDsWithToolToRender(element, toolName) {
  const enabledElement = getEnabledElement(element);
  const { renderingEngine, FrameOfReferenceUID } = enabledElement;

  let viewports = renderingEngine.getViewports();

  viewports = filterViewportsWithFrameOfReferenceUID(
    viewports,
    FrameOfReferenceUID
  );
  viewports = filterViewportsWithToolEnabled(viewports, toolName);

  const viewportUIDs = viewports.map(vp => vp.uid);

  return viewportUIDs;
}
