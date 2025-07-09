import type StandardRenderingEngine from '../RenderingEngine/StandardRenderingEngine';
import type SequentialRenderingEngine from '../RenderingEngine/SequentialRenderingEngine';

type IRenderingEngine = StandardRenderingEngine | SequentialRenderingEngine;

export type { IRenderingEngine as default };
