/** Status of a frame as it gets loaded */
enum FrameStatus {
  // Replicate is a duplicated image, from some larger distance
  REPLICATE = 1,
  // Nearby replicate is a duplicated image of a nearby image
  NEARBY_REPLICATE = 2,
  LOADING = 3,
  // Partial images
  PARTIAL = 4,
  // Lossy images, either complete or partial
  LOSSY = 5,
  DONE = 6,
}

export default FrameStatus;
