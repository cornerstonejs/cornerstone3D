import type { Types } from '@cornerstonejs/core';
import { LoaderDecodeOptions } from './LoaderDecodeOptions';
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
  getRetrieveOptions?: (
    transferSyntaxUid: string,
    retrieveTypeId?: string
  ) => Types.RetrieveConfiguration;

  strict?: boolean;
  decodeConfig?: LoaderDecodeOptions;

  /**
   * retrieveOptions is used to map transfer syntax and a lossy id
   * to the method used to retrieve that type of image.  This allows configuring
   * different retrieves based on the phase/setup of the retrieve.
   * The format is:
   *   transferSyntaxUid ('-' retrieveTypeId)?
   * where transferSyntaxUid defaults to "unknown" when not specified, and
   * retrieveTypeId is specified externally.  If no record is found, then
   * "default" will be accessed.
   */
  retrieveOptions?: Record<string, Types.RetrieveConfiguration>;
}
