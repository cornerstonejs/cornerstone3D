/**
 *
 */
var Events;
(function (Events) {
    Events["CAMERA_MODIFIED"] = "cornerstonecameramodified";
    Events["VOI_MODIFIED"] = "cornerstonevoimodified";
    Events["ELEMENT_DISABLED"] = "cornerstoneelementdisabled";
    Events["ELEMENT_ENABLED"] = "cornerstoneelementenabled";
    Events["IMAGE_RENDERED"] = "cornerstoneimagerendered";
    Events["IMAGE_VOLUME_MODIFIED"] = "cornerstoneimagevolumemodified";
    Events["IMAGE_LOADED"] = "cornerstoneimageloaded";
    Events["VOLUME_LOADED"] = "cornerstonevolumeloaded";
    Events["ELEMENT_RESIZED"] = "cornerstoneelementresized";
    Events["NEW_IMAGE"] = "cornerstonenewimage";
    Events["PRE_RENDER"] = "cornerstoneprerender";
    Events["IMAGE_CACHE_IMAGE_ADDED"] = "cornerstoneimagecacheimageadded";
    Events["IMAGE_CACHE_IMAGE_REMOVED"] = "cornerstoneimagecacheimageremoved";
    Events["IMAGE_CACHE_VOLUME_ADDED"] = "cornerstoneimagecachevolumeadded";
    Events["IMAGE_CACHE_VOLUME_REMOVED"] = "cornerstoneimagecachevolumeremoved";
    Events["IMAGE_CACHE_FULL"] = "cornerstoneimagecachefull";
    Events["IMAGE_LOAD_FAILED"] = "cornerstoneimageloadfailed";
    Events["STACK_NEW_IMAGE"] = "cornerstonenewimageinstack";
})(Events || (Events = {}));
export default Events;
//# sourceMappingURL=events.js.map