/**
 * Paths to the screenshots of the tests.
 */
const screenShotPaths = {
  renderingPipelinesCPU: {
    cpuRendering: 'stackManipulation-cpuRendering.png',
  },
  renderingPipelines: {
    preferSizeOverAccuracy1: 'preferSizeOverAccuracy1.png',
    preferSizeOverAccuracy2: 'preferSizeOverAccuracy2.png',
    norm16Texture1: 'norm16Texture1.png',
    norm16Texture2: 'norm16Texture2.png',
  },
  stackBasic: {
    viewport: 'viewport.png',
  },
  stackAPI: {
    setVoiRange: 'setVoiRange.png',
    nextImage: 'nextImage.png',
    previousImage: 'previousImage.png',
    flipH: 'flipH.png',
    flipV: 'flipV.png',
    // rotateRandom: 'rotateRandom.png',
    rotateAbsolute150: 'rotateAbsolute150.png',
    rotateDelta30: 'rotateDelta30.png',
    invert: 'invert.png',
    // randomZoomAndPan: 'randomZoomAndPan.png',
    colormap: 'colormap.png',
    resetViewport: 'resetViewport.png',
  },
  stackManipulationTools: {
    planarRotate: 'planarRotate.png',
    windowLevel: 'windowLevel.png',
  },
  stackProperties: {
    nextImage: 'nextImage.png',
    previousImage: 'previousImage.png',
    propertiesAddedForCurrentImage: 'propertiesAddedForCurrentImage.png',
    propertiesAreSameForNextImage: 'propertiesAreSameForNextImage.png',
    propertiesRemovedForCurrentImage: 'propertiesRemovedForCurrentImage.png',
    propertiesAreSameForPreviousImage: 'propertiesAreSameForPreviousImage.png',
    resetToDefaultViewportProperties: 'resetToDefaultViewportProperties.png',
    resetMetadata: 'resetMetadata.png',
  },
  volumeBasic: {
    viewport: 'viewport.png',
  },
  ultrasoundColors: {
    slice1: 'slice1.png',
    slice2: 'slice2.png',
    slice3: 'slice3.png',
    slice4: 'slice4.png',
    slice5: 'slice5.png',
    slice6: 'slice6.png',
    slice7: 'slice7.png',
  },
  splineContourSegmentationTools: {
    catmullRomSplineROI: 'catmullRomSplineROI.png',
    linearSplineROI: 'linearSplineROI.png',
    bsplineROI: 'bsplineROI.png',
    splinesOnSegmentTwo: 'splinesOnSegmentTwo.png',
  },
  surfaceRendering: {
    viewport: 'viewport.png',
  },
  labelmapSegmentationTools: {
    circularBrush: 'circularBrush.png',
    circularEraser: 'circularEraser.png',
    sphereBrush: 'sphereBrush.png',
    sphereEraser: 'sphereEraser.png',
    thresholdCircle: 'thresholdCircle.png',
    rectangleScissor: 'rectangleScissor.png',
    circleScissor: 'circleScissor.png',
    sphereScissor: 'sphereScissor.png',
    scissorEraser: 'scissorEraser.png',
    paintFill: 'paintFill.png',
  },
  labelmapSwapping: {
    defaultSegmentation: 'defaultSegmentation.png',
    swappedSegmentation: 'swappedSegmentation.png',
  },
  labelmapSegmentSpecificConfiguration: {
    defaultSegmentation: 'defaultSegmentation.png',
    segment1Alpha0: 'segment1Alpha0.png',
    segment1Alpha50: 'segment1Alpha50.png',
    segment2Alpha0: 'segment2Alpha0.png',
    segment2Alpha50: 'segment2Alpha50.png',
    segmentsAlpha25: 'segmentsAlpha25.png',
  },
  stackSegmentation: {
    circularBrushSegment1: 'circularBrushSegment1.png',
    thresholdBrushFatSegment1: 'thresholdBrushFatSegment1.png',
    thresholdBrushBoneSegment1: 'thresholdBrushBoneSegment1.png',
    dynamicThresholdInitialHighlightedPixels:
      'dynamicThresholdInitialHighlightedPixels.png',
    dynamicThresholdHighlightedContour:
      'dynamicThresholdHighlightedContour.png',
    dynamicThresholdConfirmedContour: 'dynamicThresholdConfirmedContour.png',
    circularEraserSegmentation1: 'circularEraserSegmentation1.png',
    circularEraserSegmentation2: 'circularEraserSegmentation2.png',
    rectangleScissorSegmentation1: 'rectangleScissorSegmentation1.png',
    rectangleScissorSegmentation2: 'rectangleScissorSegmentation2.png',
    circularScissorSegmentation1: 'circularScissorSegmentation1.png',
    circularScissorSegmentation2: 'circularScissorSegmentation2.png',
    paintFillSeg1OuterCircle: 'paintFillSeg1OuterCircle.png',
    paintFillSegmentation2: 'paintFillSegmentation2.png',
  },
  labelmapRendering: {
    axial: 'axial.png',
    coronal: 'coronal.png',
    sagittal: 'sagittal.png',
  },
  contourRendering: {
    viewport: 'viewport.png',
  },
  labelmapGlobalConfiguration: {
    defaultGlobalConfig: 'defaultGlobalConfig.png',
    toggleInactiveSegmentation: 'toggleInactiveSegmentation.png',
    toggleOutlineRendering: 'toggleOutlineRendering.png',
    toggleFillRendering: 'toggleFillRendering.png',
    outlineWidthActive: 'outlineWidthActive.png',
    outlineAlphaActive: 'outlineAlphaActive.png',
    outlineWidthInactive: 'outlineWidthInactive.png',
    fillAlphaActive: 'fillAlphaActive.png',
    fillAlphaInactive: 'fillAlphaInactive.png',
  },
};

export { screenShotPaths };
