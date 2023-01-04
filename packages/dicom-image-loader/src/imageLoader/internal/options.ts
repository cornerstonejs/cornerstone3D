import {
  CornerstoneWadoLoaderXhrRequestError,
  CornerstoneWadoLoaderXhrRequestParams,
} from './xhrRequest';

export interface CornerstoneWadoLoaderOptions {
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
  decodeConfig?: {
    convertFloatPixelDataToInt?: boolean;
  };
}

let options: CornerstoneWadoLoaderOptions = {
  // callback allowing customization of the xhr (e.g. adding custom auth headers, cors, etc)
  beforeSend(/* xhr, imageId */) {},
  // callback allowing modification of the xhr response before creating image objects
  beforeProcessing(xhr: XMLHttpRequest) {
    return Promise.resolve(xhr.response as ArrayBuffer);
  },
  // callback allowing modification of newly created image objects
  imageCreated(/* image */) {},
  strict: false,
  decodeConfig: {
    convertFloatPixelDataToInt: true,
  },
};

export function setOptions(newOptions: CornerstoneWadoLoaderOptions): void {
  options = Object.assign(options, newOptions);
}

export function getOptions(): CornerstoneWadoLoaderOptions {
  return options;
}
