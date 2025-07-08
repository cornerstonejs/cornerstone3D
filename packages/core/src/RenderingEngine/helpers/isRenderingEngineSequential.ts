export function isRenderingEngineSequential(renderingEngine): boolean {
  return renderingEngine?.constructor?.name === 'RenderingEngineSequential';
}
