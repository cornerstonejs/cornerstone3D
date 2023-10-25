/** Status of a frame as it gets loaded */
enum ImageStatus {
  // Replicate is a duplicated image, from some larger distance
  REPLICATE = 1,

  // Skipping a value here and after the next replicate to allow for interpolation
  // enum values.

  // Adjacent replicate is a duplicated image of a nearby image
  ADJACENT_REPLICATE = 3,
  // Loading is used to prevent replication when the actual images start becoming available
  LOADING = 5,
  // Partial images
  PARTIAL = 6,
  // Lossy images, either complete or partial
  LOSSY = 7,
  // Done means the image is full resolution/complete
  DONE = 8,
}

export default ImageStatus;
