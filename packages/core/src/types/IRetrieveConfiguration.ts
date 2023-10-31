import { ImageQualityStatus, RequestType } from '../enums';

export interface RetrieveStage {
  /**
   * An id for the stage for use in the stage completion events
   */
  id: string;
  /**
   * Set of positions - negative values are relative to the end, positive to
   * the beginning, and fractional values between 0 and 1 are relative to frame count
   */
  positions?: number[];
  /**
   * Alternately, choose positions by decimating at the given interval
   */
  decimate?: number;
  /**
   * With the given offset to decimation
   */
  offset?: number;
  /**
   * Use a specified retrieve type to add fetch arguments and configuration
   * on the retrieve URL.
   */
  retrieveType?: string;
  /**
   * The type of request to use
   */
  requestType?: RequestType;
  /**
   * THe priority to use
   */
  priority?: number;
  /**
   * A set of frames which are nearby to replicate this frame to
   */
  nearbyFrames?: NearbyFrames[];
}

export type NearbyFrames = {
  /**
   * The offset of the nearby frame to fill from the current position.
   * For example, if the current image is index 32, and the offset is -1,
   * then the frame at index 31 will be filled with 32's image data.
   */
  offset: number;
  /**
   * A second offset value use to choose a second image index to use as a
   * linear combination for this image.  Assumes the combination is
   * `value[offset] + value[linearOffset])/2`
   */
  linearOffset?: number;
  /**
   *  The status to set a newly filled image from
   */
  status?: ImageQualityStatus;
};

/**
 * Base retrieves define some alternate path information, the decode leve,
 * whether the transfer syntax supports streaming decode, and the desired
 * status and partial status used for retrieval.
 */
export type BaseRetrieveOptions = {
  /**
   * Additional arguments to add to the URL, in the format
   * arg1=value1 ('&' arg2=value2)*
   * For example: '&lossy=jhc' to use JHC lossy values
   */
  urlArguments?: string;
  /**
   * Alternate way to encode argument information by updating the frames path
   */
  framesPath?: string;
  /**
   * True to use streaming decode
   */
  streamingDecode?: boolean;
  /**
   * Decode level to attempt.  Currently only HTJ2K decoders support this.
   */
  decodeLevel?: number;
  /**
   * Status to use when the full retrieve has been completed, defined as all
   * the bytes for a given image.  Defaults to FULL_RESOLUTION, so if the
   * complete image is lossy, this should be set to LOSSY.
   */
  status?: ImageQualityStatus;
  /**
   * Status to use when not all the bytes have been retrieved.  Defaults to
   * SUBRESOLUTION.
   */
  partialStatus?: ImageQualityStatus;
};

/**
 * Range retrieves are used to retrieve part of an image, before the rest
 * of the data is available.  This is different from streaming, below, in that
 * the request itself uses a byte range to retrieve part of the data, and
 * retrieves the entire request, but part of the image data.  That separates
 * the timing for the retrieve, and is essential for fast retrieve for multiple
 * images.
 *
 * Often the total size of the range is unknown due to cors issues, if so,
 * the decodeLevel will need to be set manually here.
 */
export type RangeRetrieveOptions = BaseRetrieveOptions & {
  /**
   * byte range value to retrieve for initial decode
   * Defaults to 64,000 bytes.
   */
  initialBytes?: number | ((metadata) => number);
  /**
   * Defines the range to use, a number less than total ranges.
   * Stages do not need to use sequential ranges, the missing data
   * will be fetched as a larger fetch as required.
   */
  range: number;
  /**
   * How many total ranges to break the request up into.
   */
  totalRangesToFetch?: number | ((metadata) => number);
};

/**
 * Streaming retrieve is done when a request is decoded as it arrives.
 * That is, if you receive the first 73k as the first part of the request,
 * then that will attempt to be decoded, assuming the streamingDecode is also
 * set.  If the streamingDecode is not set, the retrieve will be streaming, but
 * the decoding wont be, so you will get a  single decode at the end.  This
 * can be used to differentiate between partially decodable transfer syntaxes
 * such as HTJ2K and others such as JLS which can be streamed for retrieve, but
 * cannot be decoded partially.
 */
export type StreamingRetrieveOptions = BaseRetrieveOptions & {
  /**
   * Indicates to use streaming request.  Does NOT imply streaming decode,
   * which is handled separately because the request may need to be streaming
   * but the response might end up not being streaming.
   */
  streaming: boolean;
};

/**
 * Retrieve options are Base, Range or Streaming RetrieveOptions.
 */
export type RetrieveOptions =
  | BaseRetrieveOptions
  | StreamingRetrieveOptions
  | RangeRetrieveOptions;

/**
 * Defines how the retrieve configuration is handled for single and multi
 * frame volumes.  This includes things like prefetch information and
 * ordering for streaming volumes.
 */
export interface IRetrieveConfiguration {
  stages?: RetrieveStage[];
}
