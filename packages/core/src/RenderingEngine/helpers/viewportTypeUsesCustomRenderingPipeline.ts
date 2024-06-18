import viewportTypeToViewportClass from './viewportTypeToViewportClass.js';

export default function viewportTypeUsesCustomRenderingPipeline(
  viewportType: string
) {
  return viewportTypeToViewportClass[viewportType].useCustomRenderingPipeline;
}
