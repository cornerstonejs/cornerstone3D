import { getConfiguration } from '../../init';
import { RenderingEngineModeEnum } from '../../enums';

export function isSequentialRenderingEngine(renderingEngine): boolean {
  const config = getConfiguration();
  return (
    config?.rendering?.renderingEngineMode === RenderingEngineModeEnum.Next
  );
}
