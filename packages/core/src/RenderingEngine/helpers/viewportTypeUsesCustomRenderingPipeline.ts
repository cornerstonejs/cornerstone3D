import type EngineViewport from '../EngineViewport';
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
  viewport: EngineViewport
): boolean {
  return viewport.getUseCustomRenderingPipeline();
}
