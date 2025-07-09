export function isSequentialRenderingEngine(renderingEngine): boolean {
  return renderingEngine?.constructor?.name === 'SequentialRenderingEngine';
}
