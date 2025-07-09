import { getConfiguration } from '../init';
import StandardRenderingEngine from './StandardRenderingEngine';
import SequentialRenderingEngine from './SequentialRenderingEngine';

class RenderingEngine {
  constructor(id?: string) {
    const config = getConfiguration();
    const renderingEngineMode = config.renderingEngineMode;

    switch (renderingEngineMode) {
      case 'standard':
        return new StandardRenderingEngine(id);
      case 'next':
        return new SequentialRenderingEngine(id);
      default:
        throw new Error(
          `Unsupported rendering engine mode: ${renderingEngineMode}. Supported modes are 'standard' and 'next'.`
        );
    }
  }
}

export default RenderingEngine;
