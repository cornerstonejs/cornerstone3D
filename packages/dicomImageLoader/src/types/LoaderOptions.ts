import { LoaderDecodeOptions } from './LoaderDecodeOptions';
import {
  CornerstoneWadoLoaderXhrRequestError,
  CornerstoneWadoLoaderXhrRequestParams,
} from './XHRRequest';

export interface LoaderOptions {
  // callback to open the object
  open?: (
    xhr: XMLHttpRequest,
    url: string,
    defaultHeaders: Record<string, string>,
    params: CornerstoneWadoLoaderXhrRequestParams
  ) => void;
  // callback allowing customization of the xhr (e.g. adding custom auth headers, cors, etc)
  beforeSend?: (
    xhr: XMLHttpRequest,
    imageId: string,
    defaultHeaders: Record<string, string>,
    params: CornerstoneWadoLoaderXhrRequestParams
  ) => Record<string, string> | void;
  // callback allowing modification of the xhr response before creating image objects
  beforeProcessing?: (xhr: XMLHttpRequest) => Promise<ArrayBuffer>;
  // callback allowing modification of newly created image objects
  imageCreated?: (...args: any[]) => void;
  onloadstart?: (event: ProgressEvent<EventTarget>, params: any) => void;
  onloadend?: (event: ProgressEvent<EventTarget>, params: any) => void;
  onreadystatechange?: (event: Event, params: any) => void;
  onprogress?: (event: ProgressEvent<EventTarget>, params: any) => void;
  errorInterceptor?: (error: CornerstoneWadoLoaderXhrRequestError) => void;
  strict?: boolean;
  decodeConfig?: LoaderDecodeOptions;
}
