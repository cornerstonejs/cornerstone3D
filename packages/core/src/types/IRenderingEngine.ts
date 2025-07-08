import type RenderingEngine from '../RenderingEngine/RenderingEngine';
import type RenderingEngineSequential from '../RenderingEngine/RenderingEngineSequential';

type IRenderingEngine = RenderingEngine | RenderingEngineSequential;

export type { IRenderingEngine as default };
