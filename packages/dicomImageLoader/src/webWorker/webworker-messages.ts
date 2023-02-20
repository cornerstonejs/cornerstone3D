import { ByteArray } from 'dicom-parser';
import {
  CornerstoneWadoLoaderDecodeOptions,
  CornerstoneWadoLoaderOptions,
} from '../imageLoader/internal/options';
import {
  CornerstoneWadoWebWorkerOptions,
  CornerstoneWadoWorkerTaskTypes,
} from '../imageLoader/webWorkerManager';
import { CornerstoneWadoImageFrame } from '../shared/image-frame';

export interface CornerstoneWadoWebWorkerDecodeTaskData {
  imageFrame: CornerstoneWadoImageFrame;
  transferSyntax: string;
  pixelData: ByteArray;
  options: CornerstoneWadoLoaderOptions;
  decodeConfig: CornerstoneWadoLoaderDecodeOptions;
}

export interface CornerstoneWadoWebWorkerDecodeData {
  taskType: 'decodeTask';
  workerIndex: number;
  data: CornerstoneWadoWebWorkerDecodeTaskData;
}

export interface CornerstoneWadoWebWorkerLoadData {
  taskType: 'loadWebWorkerTask';
  workerIndex: number;
  sourcePath: string;
  config: CornerstoneWadoWebWorkerOptions;
}

export interface CornerstoneWadoWebWorkerInitializeData {
  taskType: 'initialize';
  workerIndex: number;
  config: CornerstoneWadoWebWorkerOptions;
}

export type CornerstoneWadoWebWorkerData =
  | CornerstoneWadoWebWorkerDecodeData
  | CornerstoneWadoWebWorkerLoadData
  | CornerstoneWadoWebWorkerInitializeData;

export interface CornerstoneWadoWebWorkerResponse {
  taskType: CornerstoneWadoWorkerTaskTypes;
  status: 'failed' | 'success';
  workerIndex: number;
  data?: CornerstoneWadoImageFrame;
  result: string | CornerstoneWadoImageFrame;
}
