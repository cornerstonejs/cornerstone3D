import type { IViewport } from '../../types';
import viewportTypeToViewportClass from './viewportTypeToViewportClass';

export default function viewportTypeUsesCustomRenderingPipeline(
  viewportType: string
) {
  // @ts-expect-error
  return viewportTypeToViewportClass[viewportType].useCustomRenderingPipeline;
}

export function viewportUsesCustomRenderingPipeline(
  viewport: IViewport
): boolean {
  return viewport.getUseCustomRenderingPipeline();
}
