import type { ByteArray } from 'dicom-parser';
import type { Types } from '@cornerstonejs/core';
import type { LoaderOptions } from './LoaderOptions';
import type { LoaderDecodeOptions } from './LoaderDecodeOptions';

export interface WebWorkerOptions {
  maxWebWorkers?: number;
  startWebWorkersOnDemand?: boolean;
  webWorkerTaskPaths?: string[];
  taskConfiguration?: WebWorkerTaskOptions;
}

export interface WebWorkerDecodeConfig {
  initializeCodecsOnStartup: boolean;
  strict?: boolean;
}

export interface WebWorkerTaskOptions {
  decodeTask: WebWorkerDecodeConfig;
}

export interface WebWorkerDeferredObject<T = unknown> {
  resolve: (arg: T | PromiseLike<T>) => void;
  reject: (err) => void;
}
export type WorkerTaskTypes = 'decodeTask' | 'loadWebWorkerTask' | 'initialize';

// array of queued tasks sorted with highest priority task first
export interface WorkerTask {
  taskId: number;
  taskType: WorkerTaskTypes;
  status: 'ready' | 'success' | 'failed';
  added: number;
  start?: number;
  data: WebWorkerDecodeTaskData;
  deferred: WebWorkerDeferredObject;
  priority: number;
  transferList: Transferable[];
}

export interface WebWorkerDecodeTaskData {
  imageFrame: Types.IImageFrame;
  transferSyntax: string;
  pixelData: ByteArray;
  options: LoaderOptions;
  decodeConfig: LoaderDecodeOptions;
}

export interface WebWorkerDecodeData {
  taskType: 'decodeTask';
  workerIndex: number;
  data: WebWorkerDecodeTaskData;
}

export interface WebWorkerLoadData {
  taskType: 'loadWebWorkerTask';
  workerIndex: number;
  sourcePath: string;
  config: WebWorkerOptions;
}

export interface WebWorkerInitializeData {
  taskType: 'initialize';
  workerIndex: number;
  config: WebWorkerOptions;
}

export type WebWorkerData =
  | WebWorkerDecodeData
  | WebWorkerLoadData
  | WebWorkerInitializeData;

export interface WebWorkerResponse {
  taskType: WorkerTaskTypes;
  status: 'failed' | 'success';
  workerIndex: number;
  data?: Types.IImageFrame;
  result: string | Types.IImageFrame;
}
