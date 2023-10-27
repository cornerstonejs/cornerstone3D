/**
 * Status of a frame as it gets loaded.  This is ordered, with lower
 * values being more lossy, and higher values being less lossy.
 */
enum ImageStatus {
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
   * Sub resolution images are encodings of smaller than full size, and are
   * generally lower quality than a lossy regular image.
   */
  SUBRESOLUTION = 6,
  /**
   *  Lossy images, either complete or partial
   */
  LOSSY = 7,
  /**
   *  Full resolution means the image is full resolution/complete data/lossless
   * (or at least as lossless as the image is going to get)
   */
  FULL_RESOLUTION = 8,
}

export default ImageStatus;
