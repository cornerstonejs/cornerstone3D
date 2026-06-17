import type { IViewport } from '../../types';
import {
  getViewportClassForInput,
  isRegisteredViewportType,
} from './viewportTypeToViewportClass';

export default function viewportTypeUsesCustomRenderingPipeline(
  viewportType: string
) {
  if (!isRegisteredViewportType(viewportType)) {
    return false;
  }

  return Boolean(
    getViewportClassForInput({ type: viewportType as never })
      .useCustomRenderingPipeline
  );
}

export function viewportUsesCustomRenderingPipeline(
  viewport: IViewport
): boolean {
  return viewport.getUseCustomRenderingPipeline();
}
