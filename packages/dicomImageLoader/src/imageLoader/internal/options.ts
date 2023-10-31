import type { RetrieveOptions } from '@cornerstonejs/core';
import { LoaderOptions } from '../../types';

let options: LoaderOptions = {
  // callback to open the object
  open(xhr, url) {
    xhr.open('get', url, true);
  },
  // callback allowing customization of the xhr (e.g. adding custom auth headers, cors, etc)
  beforeSend(/* xhr, imageId */) {
    // before send code
  },
  // callback allowing modification of the xhr response before creating image objects
  beforeProcessing(xhr: XMLHttpRequest) {
    return Promise.resolve(xhr.response as ArrayBuffer);
  },
  // callback allowing modification of newly created image objects
  imageCreated(/* image */) {
    // image created code
  },

  /**
   * Gets the retrieve options registered for the given
   * combination of transfer syntax and retrieve type.
   * unknown is used as the transfer syntnax if not found, and
   * default is used if the base options are not found.
   *
   * For example with transfer syntax 1.2.3, type lossy
   *   `1.2.3-lossy` is looked at first
   *   `default-lossy` is the default key for lossy retrieve type
   *
   * For unspecified tsuid and no type the keys are:
   *   `unknown`
   *   `default`
   */
  getRetrieveOptions(
    retrieveType = 'default',
    transferSyntaxUID = 'unknown'
  ): RetrieveOptions {
    const { retrieveOptions } = this;
    if (!retrieveOptions) {
      return null;
    }
    // Handle null/empty string as well
    transferSyntaxUID ||= 'unknown';

    const retrieveTypeOptions = retrieveOptions[retrieveType];
    const retrieveTypeDefault = retrieveOptions.default;

    return (
      retrieveTypeOptions?.[transferSyntaxUID] ||
      retrieveTypeOptions?.default ||
      retrieveTypeDefault?.[transferSyntaxUID] ||
      retrieveTypeDefault?.default ||
      {}
    );
  },

  strict: false,
  decodeConfig: {
    convertFloatPixelDataToInt: true,
    use16BitDataType: false,
  },

  retrieveOptions: {
    // The request retrieve type is used for the initial request type defaults
    // The default request type is used when not otherwise specified
    default: {
      // For HTJ2K, set streaming to true both for the request and retrieve phases
      '3.2.840.10008.1.2.4.96': {
        streaming: true,
      },
      // For unknown data elements, try streaming, so that if the actual data
      // is HTJ2K, the response can be decoded streaming.
      request: {
        streaming: true,
      },
      // Otherwise, fallback to not streaming the request
      default: {
        streaming: false,
      },
    },
  },
};

export function setOptions(newOptions: LoaderOptions): void {
  options = Object.assign(options, newOptions);
}

export function getOptions(): LoaderOptions {
  return options;
}
