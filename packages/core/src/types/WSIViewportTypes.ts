import type { ViewportType } from '../enums';

export interface WSIViewportInput {
  id: string;
  renderingEngineId: string;
  type: ViewportType;
  element: HTMLDivElement;
  sx: number;
  sy: number;
  sWidth: number;
  sHeight: number;
  defaultOptions: Record<string, unknown>;
  canvas: HTMLCanvasElement;
}
