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
  ) => Promise<Record<string, string> | void> | Record<string, string> | void;
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
   * Preload image decoders during initialization.
   * - true: preload all available decoders
   * - string[]: array of decoder names to preload (e.g., ['htj2k', 'jpeg2000', 'jpegls'])
   * - false/undefined: no preloading (default)
   */
  preloadDecoders?: boolean | string[];
}
