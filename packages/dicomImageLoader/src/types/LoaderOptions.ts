import { LoaderDecodeOptions } from './LoaderDecodeOptions';
import { WADORSMetaData } from './WADORSMetaData';
import { LoaderXhrRequestError, LoaderXhrRequestParams } from './XHRRequest';

export interface LoaderOptions {
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

  /**
   * Progressively render images as the image is downloaded, if the transfer
   * syntax supports it.
   */
  progressivelyRender?: boolean;

  /**
   * Whether to use web Streams api or byte ranges to progressively load data.
   * Web Streams: https://developer.mozilla.org/en-US/docs/Web/API/Streams_API
   */
  streamMethod?: 'web-streams' | 'byte-ranges';

  /**
   * If using byte ranges, how many bytes should be requested in the initial
   * request. This can be helpful to establish a rough minimum initial image
   * quality, although this will vary by modality.
   */
  initialBytes?:
    | number
    | ((metaData: WADORSMetaData, imageId: string) => number);

  /**
   * If using byte ranges, how many total byte range requests should be used
   * to fetch the entire image. The initial request counts as one, and
   * subsequent ranges will be divided equally among the remaining bytes. For
   * example, if the file is 1_000_000 bytes in total, `initialBytes` is
   * set to 5_000, and `totalRanges` is set to 4, you will get:
   *
   * Request 1: 5_000 bytes
   * Request 2: 331_667 bytes
   * Request 3: 331_667 bytes
   * Request 4: 331_664 bytes
   *
   * Setting `totalRanges` to 2 will load the remainder of the file on the
   * second request after `initialBytes` are loaded.
   */
  totalRanges?:
    | number
    | ((metaData: WADORSMetaData, imageId: string) => number);

  /**
   * If using web streams, set the minimum chunk size before sending another
   * decode request.
   */
  minChunkSize?:
    | number
    | ((metaData: WADORSMetaData, imageId: string) => number);

  strict?: boolean;
  decodeConfig?: LoaderDecodeOptions;
}
