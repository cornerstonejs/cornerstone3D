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
  getRetrieveOptions(transferSyntaxUID, retrieveType = '') {
    const { retrieveOptions } = this;
    if (!retrieveOptions) {
      return null;
    }
    transferSyntaxUID ||= 'unknown';

    const baseKey = retrieveType
      ? `${transferSyntaxUID}-${retrieveType}`
      : transferSyntaxUID;
    const defaultKey = retrieveType ? `default-${retrieveType}` : 'default';

    return retrieveOptions[baseKey] || retrieveOptions[defaultKey];
  },

  strict: false,
  decodeConfig: {
    convertFloatPixelDataToInt: true,
    use16BitDataType: false,
  },

  retrieveOptions: {
    '3.2.840.10008.1.2.4.96': {
      streaming: true,
    },
    'default-lossy': {},
    '3.2.840.10008.1.2.4.96-lossy': {
      isLossy: true,
      streaming: false,
      //needsScale: true,
    },
    '3.2.840.10008.1.2.4.96-final': {
      isLossy: false,
      streaming: false,
      //needsScale: true,
    },
    // '3.2.840.10008.1.2.4.96-lossy': {
    //   streaming: true,
    //   // needsScale: true,
    // },
  },
};

export function setOptions(newOptions: LoaderOptions): void {
  options = Object.assign(options, newOptions);
}

export function getOptions(): LoaderOptions {
  return options;
}
