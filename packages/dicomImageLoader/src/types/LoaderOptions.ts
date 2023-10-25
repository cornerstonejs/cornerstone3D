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
  /**
   * Gets retrieve options for the images.  This separates out the use of
   * different retrieve types from the actual DICOMweb request back end
   * configuration.
   * @param retrieveType - the retrieve type, which is a user defined configuration,
   *      although 'lossy' and 'final' are used internally.
   * @param transferSyntaxUID - the transfer syntax if available, defaults to
   *       'unknown'
   * @returns RetrieveConfiguration to use for this pair of values.
   */
  getRetrieveOptions?: (
    retrieveType: string
    transferSyntaxUID: string,
  ) => Types.RetrieveOptions;

  strict?: boolean;
  decodeConfig?: LoaderDecodeOptions;

  /**
   * retrieveOptions is used to map transfer syntax and a lossy id
   * to the method used to retrieve that type of image.  This allows configuring
   * different retrieves based on the phase/setup of the retrieve.
   *
   * The key is retrieve type to transfer syntax to retrieve options.
   * There are defaults at both levels if a more specific value isnt' found.
   * For the retrieve type, the default is 'default'
   * For the transfer syntax, the default value will be provided based on
   * if this is in the request or retrieve stage, so that values like streaming
   * can be set to true in the request phase and false in the default retrieve.
   */
  retrieveOptions?: Record<string, Record<string, Types.RetrieveOptions>>;
}
