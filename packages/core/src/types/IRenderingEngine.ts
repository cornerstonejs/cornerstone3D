import type RenderingEngine from '../RenderingEngine/RenderingEngine';
import type SequentialRenderingEngine from '../RenderingEngine/SequentialRenderingEngine';

type IRenderingEngine = RenderingEngine | SequentialRenderingEngine;

export type { IRenderingEngine as default };
