/**
 *
 */
enum Events {
  CAMERA_MODIFIED = 'cornerstonecameramodified',
  VOI_MODIFIED = 'cornerstonevoimodified',
  ELEMENT_DISABLED = 'cornerstoneelementdisabled',
  ELEMENT_ENABLED = 'cornerstoneelementenabled',
  IMAGE_RENDERED = 'cornerstoneimagerendered',
  IMAGE_VOLUME_MODIFIED = 'cornerstoneimagevolumemodified',
  IMAGE_LOADED = 'cornerstoneimageloaded',
  VOLUME_LOADED = 'cornerstonevolumeloaded',
  ELEMENT_RESIZED = 'cornerstoneelementresized',
  NEW_IMAGE = 'cornerstonenewimage',
  PRE_RENDER = 'cornerstoneprerender',
  IMAGE_CACHE_IMAGE_ADDED = 'cornerstoneimagecacheimageadded',
  IMAGE_CACHE_IMAGE_REMOVED = 'cornerstoneimagecacheimageremoved',
  IMAGE_CACHE_VOLUME_ADDED = 'cornerstoneimagecachevolumeadded',
  IMAGE_CACHE_VOLUME_REMOVED = 'cornerstoneimagecachevolumeremoved',
  IMAGE_CACHE_FULL = 'cornerstoneimagecachefull',
  IMAGE_LOAD_FAILED = 'cornerstoneimageloadfailed',
  STACK_NEW_IMAGE = 'cornerstonenewimageinstack',
}

export default Events
