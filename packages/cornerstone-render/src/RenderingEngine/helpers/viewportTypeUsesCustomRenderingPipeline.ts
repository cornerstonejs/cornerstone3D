import viewportTypeToViewportClass from './viewportTypeToViewportClass';

export default function viewportTypeUsesCustomRenderingPipeline(
  viewportType: string
) {
  return viewportTypeToViewportClass[viewportType].useCustomRenderingPipeline;
}
