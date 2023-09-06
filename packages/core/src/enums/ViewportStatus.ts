enum ViewportStatus {
  /** Initial state before any volumes or stacks are available*/
  NO_DATA = 'noData',
  /** Stack/volumes are available but are in progress */
  LOADING = 'loading',
  /** Ready to be rendered */
  PRE_RENDER = 'preRender',
  /** In the midst of a resize */
  RESIZE = 'resize',
  /** Rendered image data */
  RENDERED = 'rendered',
}

export default ViewportStatus;
