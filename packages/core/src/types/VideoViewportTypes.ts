import { ViewportType } from '../enums/index.js';
import Point2 from './Point2.js';

export type InternalVideoCamera = {
  panWorld?: Point2;
  parallelScale?: number;
};

export type VideoViewportInput = {
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
