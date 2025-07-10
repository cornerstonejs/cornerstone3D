import { getConfiguration } from '../../init';
import { RenderingEngineModeEnum } from '../../enums';

export function isNextRenderingEngine(): boolean {
  const config = getConfiguration();
  return (
    config?.rendering?.renderingEngineMode === RenderingEngineModeEnum.Next
  );
}
