import { ImageQualityStatus, RequestType } from '../enums';
import { ImageLoadListener } from './ImageLoadListener';

/**
 * Retrieve stages are part of a retrieval of a set of image ids.
 * Each retrieve stage defines which imageIds to include, as well as how
 * that set should be handled.  An imageID can be retrieved multiple times,
 * done in order, one after the other, so that it is first retrieved as a
 * lossy/low quality image, followed by higher qualities.  The actual
 * retrieve options used are abstracted out by the retrieve type, a simple
 * string that defines what type of retrieve values are used.
 *
 * See Progressive Loading in the overall docs for information on retrieval
 * stages.
 */
export interface RetrieveStage {
  /**
   * An id for the stage for use in the stage completion events
   */
  id: string;
  /**
   * Set of positions in a list of imageID's to select for this stage.
   * Negative values are relative to the end, positive to
   * the beginning, and fractional values between -1 and 1 are relative to frame count
   */
  positions?: number[];
  /**
   * Alternately to the positions, choose imageId's by decimating
   * at the given interval decimate interval/offset.
   */
  decimate?: number;
  /**
   * Use the given offset.  For example, a decimate of 4 and offset of 1 will
   * choose from the set `[0...12]`  the values `1,5,9`
   */
  offset?: number;
  /**
   * Use a specified retrieve type to specify the type of retrieve this stage
   * uses.  There are four standard retrieve types, but others can be defined
   * as required.  The four standard ones are:
   *
   * * singleFast - for a fast/low quality single image
   * * singleFinal - for the final quality single image
   * * multipleFast - for a fast/low quality image for multiples
   * * multipleFinal - for a final image for multiple images
   *
   * The single/multiple split is done so that the single retrieve can be
   * a streaming type retrieve, which doesn't work well for multiple images where
   * an entire set of lower quality images is desireable before starting with the
   * high quality set, but the streaming retrieve does work very well for single
   * images.
   */
  retrieveType?: string;
  /**
   * The queue request type to use.
   */
  requestType?: RequestType;
  /**
   * The queue priority to use
   */
  priority?: number;
  /**
   * A set of frames which are nearby to replicate this frame to
   * This allows defining how replication within the volume occurs.
   */
  nearbyFrames?: NearbyFrames[];
}

/**
 * Nearby frames are used in a volume to fill the entire volume quickly without
 * needing to have retrieved them from a remote/slow location.  This gives the
 * appearance of a complete volume extremely quickly.
 */
export type NearbyFrames = {
  /**
   * The offset of the nearby frame to fill from the current position.
   * For example, if the current image is index 32, and the offset is -1,
   * then the frame at index 31 will be filled with 32's image data.
   */
  offset: number;
  /**
   *  The status to set a newly filled image from
   */
  imageQualityStatus?: ImageQualityStatus;
};

/**
 * Base retrieves define some alternate path information, the decode level,
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
   * Decode level to attempt.  Currently only HTJ2K decoders support this.
   * Value of 0 means decode full resolution,
   * * 1 means 1/2 resolution in each dimension (eg 1/4 size)
   * * i means 1/2^i resolution in each dimension, or 1/4^i size.
   */
  decodeLevel?: number;
  /**
   * Status to use when the full retrieve has been completed, defined as all
   * the bytes for a given image.  Defaults to FULL_RESOLUTION, so if the
   * complete image is lossy, this should be set to LOSSY.
   */
  imageQualityStatus?: ImageQualityStatus;
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
   * Defines the rangeIndex to use.
   * Stages do not need to use sequential ranges, the missing data
   * will be fetched as a larger fetch as required.
   * Terminate range requests with a rangeIndex: -1 to fetch remaining data.
   */
  rangeIndex: number;

  /**
   * byte range value to retrieve for initial decode
   * Defaults to 64,000 bytes.
   */
  chunkSize?: number | ((metadata) => number);
};

/**
 * Streaming retrieve is done when a request is decoded as it arrives.
 * That is, if you receive the first 73k as the first part of the request,
 * then that will attempt to be decoded.
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
 * frame volumes.  Currently, the only configuration is a list of stages
 * specify how sets of images ids get retrieved together or separately, and
 * what type of retrieves and which queue is used for retrieving.
 *
 * The intent is to add other information on how to retrieve here in the future.
 * This could include the specific retrieve options or could control queue
 * strategy, prefetch etc.
 */
export interface IRetrieveConfiguration {
  /**
   * Creates an image loader, defaulting to ProgressiveRetrieveImages
   */
  create?: (IRetrieveConfiguration) => IImagesLoader;
  retrieveOptions?: Record<string, RetrieveOptions>;
  stages?: RetrieveStage[];
}

/**
 * Provides a method to load a stack of images.
 */
export interface IImagesLoader {
  loadImages: (
    imageIds: string[],
    listener: ImageLoadListener
  ) => Promise<unknown>;
}
