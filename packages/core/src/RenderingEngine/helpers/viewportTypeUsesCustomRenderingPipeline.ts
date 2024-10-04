import viewportTypeToViewportClass from './viewportTypeToViewportClass';

export default function viewportTypeUsesCustomRenderingPipeline(
  viewportType: string
) {
  // @ts-expect-error
  return viewportTypeToViewportClass[viewportType].useCustomRenderingPipeline;
}
