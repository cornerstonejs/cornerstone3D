import { getConfiguration } from '../../init';

export function isSequentialRenderingEngine(renderingEngine): boolean {
  const config = getConfiguration();
  return config.renderingEngineMode === 'next';
}
