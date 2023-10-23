/** Status of a frame as it gets loaded */
enum FrameStatus {
  // Replicate is a duplicated image, from some larger distance
  REPLICATE = 1,
  // Linear replicate is an average/linear interpolation of two images
  LINEAR_REPLICATE = 2,
  // Adjacent replicate is a duplicated image of a nearby image
  ADJACENT_REPLICATE = 3,
  // Loading is used to prevent replication when the actual images start becoming available
  LOADING = 4,
  // Partial images
  PARTIAL = 5,
  // Lossy images, either complete or partial
  LOSSY = 6,
  DONE = 7,
}

export default FrameStatus;
