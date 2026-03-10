import ContextPoolRenderingEngine from './ContextPoolRenderingEngine';
import type { PublicViewportInput } from '../types';

class ContextPoolRenderingEngineV2 extends ContextPoolRenderingEngine {
  public enableViewport(viewportInputEntry: PublicViewportInput): void {
    this.enableElement(viewportInputEntry);
  }

  public disableViewport(viewportId: string): void {
    this.disableElement(viewportId);
  }
}

export default ContextPoolRenderingEngineV2;
