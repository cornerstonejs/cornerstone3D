import type StandardRenderingEngine from '../RenderingEngine/StandardRenderingEngine';
import type SequentialRenderingEngine from '../RenderingEngine/SequentialRenderingEngine';
import type BaseRenderingEngine from '../RenderingEngine/BaseRenderingEngine';

type IRenderingEngine =
  | StandardRenderingEngine
  | SequentialRenderingEngine
  | BaseRenderingEngine;

export type { IRenderingEngine as default };
