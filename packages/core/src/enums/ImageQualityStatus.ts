/**
 * Status of a frame as it gets loaded.  This is ordered, with lower
 * values being more lossy, and higher values being less lossy.
 */
enum ImageQualityStatus {
  /**
   *  Replicate is a duplicated image, from some larger distance
   */
  FAR_REPLICATE = 1,

  // Skipping a value here and after the next replicate to allow for interpolation
  // enum values.

  /**
   * Adjacent replicate is a duplicated image of a nearby image
   */
  ADJACENT_REPLICATE = 3,

  /**
   * Sub resolution images are encodings of smaller than full resolution
   * images.  The encoding may or may not be lossy, but the lower resolution
   * means it has lost information already compared to full resolution/lossless.
   */
  SUBRESOLUTION = 6,

  /**
   *  Lossy images, encoded with a lossy encoding, but full resolution or size.
   */
  LOSSY = 7,
  /**
   *  Full resolution means the image is full resolution/complete data/lossless
   * (or at least as lossless as the image is going to get)
   */
  FULL_RESOLUTION = 8,
}

export default ImageQualityStatus;
