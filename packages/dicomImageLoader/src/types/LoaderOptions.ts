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
   * @param transferSyntaxUID - the transfer syntax if available, defaults to
   *       'unknown'
   * @param retrieveType - the retrieve type, which is a user defined configuration,
   *      although 'lossy' and 'final' are used internally.
   * @returns RetrieveConfiguration to use for this pair of values.
   */
  getRetrieveOptions?: (
    transferSyntaxUID: string,
    retrieveType?: string
  ) => Types.RetrieveConfiguration;

  strict?: boolean;
  decodeConfig?: LoaderDecodeOptions;

  /**
   * retrieveOptions is used to map transfer syntax and a lossy id
   * to the method used to retrieve that type of image.  This allows configuring
   * different retrieves based on the phase/setup of the retrieve.
   * The format is:
   *   transferSyntaxUID ('-' retrieveTypeId)?
   * where transferSyntaxUID defaults to "unknown" when not specified, and
   * retrieveTypeId is specified externally.  If no record is found, then
   * "default" will be accessed.
   */
  retrieveOptions?: Record<string, Types.RetrieveOptions>;
}
