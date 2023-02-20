import { ByteArray } from 'dicom-parser';
import ImageFrame from './ImageFrame';
import { LoaderOptions } from './LoaderOptions';
import { LoaderDecodeOptions } from './LoaderDecodeOptions';

export interface CornerstoneWadoWebWorkerOptions {
  maxWebWorkers?: number;
  startWebWorkersOnDemand?: boolean;
  webWorkerTaskPaths?: string[];
  taskConfiguration?: CornerstoneWadoWebWorkerTaskOptions;
}

export interface CornerstoneWadoWebWorkerDecodeConfig {
  initializeCodecsOnStartup: boolean;
  strict?: boolean;
}

export interface CornerstoneWadoWebWorkerTaskOptions {
  decodeTask: CornerstoneWadoWebWorkerDecodeConfig;
}

export interface CornerstoneWebWorkerDeferredObject<T = any> {
  resolve: (arg: T | PromiseLike<T>) => void;
  reject: (err: any) => void;
}
export type CornerstoneWadoWorkerTaskTypes =
  | 'decodeTask'
  | 'loadWebWorkerTask'
  | 'initialize';

// array of queued tasks sorted with highest priority task first
export interface CornerstoneWorkerTask {
  taskId: number;
  taskType: CornerstoneWadoWorkerTaskTypes;
  status: 'ready' | 'success' | 'failed';
  added: number;
  start?: number;
  data: CornerstoneWadoWebWorkerDecodeTaskData;
  deferred: CornerstoneWebWorkerDeferredObject;
  priority: number;
  transferList: Transferable[];
}

export interface CornerstoneWadoWebWorkerDecodeTaskData {
  imageFrame: ImageFrame;
  transferSyntax: string;
  pixelData: ByteArray;
  options: LoaderOptions;
  decodeConfig: LoaderDecodeOptions;
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
  data?: ImageFrame;
  result: string | ImageFrame;
}
