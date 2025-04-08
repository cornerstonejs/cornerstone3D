import type { LoaderDecodeOptions } from './LoaderDecodeOptions';
import type {
  LoaderXhrRequestError,
  LoaderXhrRequestParams,
} from './XHRRequest';

export interface LoaderOptions {
  maxWebWorkers?: number;
  // callback to open the object
  open?: (
    xhr: XMLHttpRequest,
    url: string,
    defaultHeaders: Record<string, string>,
    params: LoaderXhrRequestParams
  ) => void;
  // callback allowing customization of the xhr (e.g. adding custom auth headers, cors, etc)
  beforeSend?: (
    xhr: XMLHttpRequest,
    imageId: string,
    defaultHeaders: Record<string, string>,
    params: LoaderXhrRequestParams
  ) => Record<string, string> | void;
  // callback allowing modification of the xhr response before creating image objects
  beforeProcessing?: (xhr: XMLHttpRequest) => Promise<ArrayBuffer>;
  // callback allowing modification of newly created image objects
  imageCreated?: (imageObject: unknown) => void;
  onloadstart?: (event: ProgressEvent<EventTarget>, params: unknown) => void;
  onloadend?: (event: ProgressEvent<EventTarget>, params: unknown) => void;
  onreadystatechange?: (event: Event, params: unknown) => void;
  onprogress?: (event: ProgressEvent<EventTarget>, params: unknown) => void;
  errorInterceptor?: (error: LoaderXhrRequestError) => void;
  strict?: boolean;
  decodeConfig?: LoaderDecodeOptions;
  /**
   * Pass a custom web worker factory function to create the web worker.
   *
   * By default, cornerstone creates the path to the web worker, relying on a
   * bundler to resolve the path. This is not always possible, especially when
   * using a custom bundler or when the web worker is not in the same directory
   * as the main script.  This is particularly helpful when including
   * `@cornerstonejs/dicom-image-loader` in an Angular project.
   *
   * This option allows you to provide a custom function that returns a new web
   * worker instance.
   *
   * @example
   * ```typescript
   * const customWebWorkerFactory = () => {
   *  const worker = new Worker('path/to/your/customWorker.js');
   *  return worker;
   * }
   *
   * const loaderOptions: LoaderOptions = {
   *   webWorkerFactory: customWebWorkerFactory,
   * }
   * ```
   */
  webWorkerFactory?: () => Worker;
}
