/** Status of a frame as it gets loaded */
enum FrameStatus {
  REPLICATE = 1,
  LOADING = 2,
  LOSSY = 3,
  DONE = 4,
}

export default FrameStatus;
