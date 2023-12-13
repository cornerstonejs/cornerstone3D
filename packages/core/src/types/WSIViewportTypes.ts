import { ViewportType } from '../enums';

export type WSIViewportInput = {
  id: string;
  renderingEngineId: string;
  type: ViewportType;
  element: HTMLDivElement;
  sx: number;
  sy: number;
  sWidth: number;
  sHeight: number;
  defaultOptions: any;
  canvas: HTMLCanvasElement;
};
