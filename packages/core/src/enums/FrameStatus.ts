/** Status of a frame as it gets loaded */
enum FrameStatus {
  // Replicate is a duplicated image, from some larger distance
  REPLICATE = 1,
  // Nearby replicate is a duplicated image of a nearby image
  NEARBY_REPLICATE = 2,
  LOADING = 3,
  LOSSY = 4,
  DONE = 5,
}

export default FrameStatus;
