import { getConfiguration } from '../../init';
import { RenderingEngineModeEnum } from '../../enums';

export function isContextPoolRenderingEngine(): boolean {
  const config = getConfiguration();
  const mode = config?.rendering?.renderingEngineMode;
  return mode === RenderingEngineModeEnum.ContextPool;
}
