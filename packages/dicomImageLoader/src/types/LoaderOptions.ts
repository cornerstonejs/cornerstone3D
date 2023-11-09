import { LoaderDecodeOptions } from './LoaderDecodeOptions';
import { LoaderXhrRequestError, LoaderXhrRequestParams } from './XHRRequest';

export interface LoaderOptions {
  cornerstone?: any;
  dicomParser?: any;
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
  imageCreated?: (...args: any[]) => void;
  onloadstart?: (event: ProgressEvent<EventTarget>, params: any) => void;
  onloadend?: (event: ProgressEvent<EventTarget>, params: any) => void;
  onreadystatechange?: (event: Event, params: any) => void;
  onprogress?: (event: ProgressEvent<EventTarget>, params: any) => void;
  errorInterceptor?: (error: LoaderXhrRequestError) => void;
  strict?: boolean;
  decodeConfig?: LoaderDecodeOptions;
}
