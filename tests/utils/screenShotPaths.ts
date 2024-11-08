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
  dicomImageLoaderWADOURI: {
    'CTImage.dcm_JPEGLSLosslessTransferSyntax_1.2.840.10008.1.2.4.80.dcm':
      'dicomImageLoaderWADOURI/CTImage_JPEGLSLossless.png',
    'CTImage.dcm_JPEGLSLossyTransferSyntax_1.2.840.10008.1.2.4.81.dcm':
      'dicomImageLoaderWADOURI/CTImage_JPEGLSLossy.png',
    'CTImage.dcm_JPEGProcess1TransferSyntax_1.2.840.10008.1.2.4.50.dcm':
      'dicomImageLoaderWADOURI/CTImage_JPEGProcess1.png',
    'CTImage.dcm_RLELosslessTransferSyntax_1.2.840.10008.1.2.5.dcm':
      'dicomImageLoaderWADOURI/CTImage_RLELossless.png',
    'CTImage.dcm_JPEGProcess14TransferSyntax_1.2.840.10008.1.2.4.57.dcm':
      'dicomImageLoaderWADOURI/CTImage_JPEGProcess14.png',
    'CTImage.dcm_JPEGProcess14SV1TransferSyntax_1.2.840.10008.1.2.4.70.dcm':
      'dicomImageLoaderWADOURI/CTImage_JPEGProcess14SV1.png',
    'CTImage.dcm_JPEG2000LosslessOnlyTransferSyntax_1.2.840.10008.1.2.4.90.dcm':
      'dicomImageLoaderWADOURI/CTImage_JPEG2000LosslessOnly.png',
    'CTImage.dcm_JPEG2000TransferSyntax_1.2.840.10008.1.2.4.91.dcm':
      'dicomImageLoaderWADOURI/CTImage_JPEG2000.png',
    'CTImage.dcm_DeflatedExplicitVRLittleEndianTransferSyntax_1.2.840.10008.1.2.1.99.dcm':
      'dicomImageLoaderWADOURI/CTImage_DeflatedExplicitVRLittleEndian.png',
    'TestPattern_JPEG-Baseline_YBR422.dcm':
      'dicomImageLoaderWADOURI/TestPattern_JPEG-Baseline_YBR422.png',
    'TestPattern_JPEG-Baseline_YBRFull.dcm':
      'dicomImageLoaderWADOURI/TestPattern_JPEG-Baseline_YBRFull.png',
    'TestPattern_JPEG-Lossless_RGB.dcm':
      'dicomImageLoaderWADOURI/TestPattern_JPEG-Lossless_RGB.png',
    'TestPattern_JPEG-LS-Lossless.dcm':
      'dicomImageLoaderWADOURI/TestPattern_JPEG-LS-Lossless.png',
    'TestPattern_JPEG-LS-NearLossless.dcm':
      'dicomImageLoaderWADOURI/TestPattern_JPEG-LS-NearLossless.png',
    'TestPattern_Palette_16.dcm':
      'dicomImageLoaderWADOURI/TestPattern_Palette_16.png',
    'TestPattern_Palette.dcm':
      'dicomImageLoaderWADOURI/TestPattern_Palette.png',
    'TestPattern_RGB.dcm': 'dicomImageLoaderWADOURI/TestPattern_RGB.png',
    'TG_18-luminance-1K/TG18-AD/TG18-AD-1k-01.dcm':
      'dicomImageLoaderWADOURi/TG18-AD-1k-01.png',
    'TG_18-luminance-1K/TG18-CT/TG18-CT-1k-01.dcm':
      'dicomImageLoaderWADOURi/TG18-CT-1k-01.png',
    'TG_18-luminance-1K/TG18-LN/TG18-LN-1k-01.dcm':
      'dicomImageLoaderWADOURi/TG18-LN-1k-01.png',
    'TG_18-luminance-1K/TG18-LN/TG18-LN-1k-04.dcm':
      'dicomImageLoaderWADOURi/TG18-LN-1k-04.png',
    'TG_18-luminance-1K/TG18-LN/TG18-LN-1k-09.dcm':
      'dicomImageLoaderWADOURi/TG18-LN-1k-09.png',
    'TG_18-luminance-1K/TG18-LN/TG18-LN-1k-13.dcm':
      'dicomImageLoaderWADOURi/TG18-LN-1k-13.png',
    'TG_18-luminance-1K/TG18-LN/TG18-LN-1k-18.dcm':
      'dicomImageLoaderWADOURi/TG18-LN-1k-18.png',
    'TG_18-luminance-1K/TG18-MP/TG18-MP-1k-01.dcm':
      'dicomImageLoaderWADOURi/TG18-MP-1k-01.png',
    'TG_18-luminance-1K/TG18-UN/TG18-UN-1k-01.dcm':
      'dicomImageLoaderWADOURi/TG18-UN-1k-01.png',
    'TG_18-luminance-1K/TG18-UNL/TG18-UNL-1k-01.dcm':
      'dicomImageLoaderWADOURi/TG18-UNL-1k-01.png',
    'TG_18-multi-1K/TG18-BR/TG18-BR-1k-01.dcm':
      'dicomImageLoaderWADOURi/TG18-BR-1k-01.png',
    'TG_18-multi-1K/TG18-QC/TG18-QC-1k-01.dcm':
      'dicomImageLoaderWADOURi/TG18-QC-1k-01.png',
    'TG_18-multi-1K/TG18-pQC/TG18-PQC-1k-01.dcm':
      'dicomImageLoaderWADOURi/TG18-PQC-1k-01.png',
    'TG_18-noise-1k/TG18-AFC/TG18-AFC-1k-01.dcm':
      'dicomImageLoaderWADOURi/TG18-AFC-1k-01.png',
    'TG_18-noise-1k/TG18-NS/TG18-NS-1k-01.dcm':
      'dicomImageLoaderWADOURi/TG18-NS-1k-01.png',
    'TG_18-noise-1k/TG18-NS/TG18-NS-1k-02.dcm':
      'dicomImageLoaderWADOURi/TG18-NS-1k-02.png',
    'TG_18-noise-1k/TG18-NS/TG18-NS-1k-03.dcm':
      'dicomImageLoaderWADOURi/TG18-NS-1k-03.png',
    'TG_18-resolution-2k/TG18-CX/TG18-CX-2k-01.dcm':
      'dicomImageLoaderWADOURi/TG18-CX-2k-01.png',
    'TG_18-resolution-2k/TG18-LPH/TG18-LPH-2k-01.dcm':
      'dicomImageLoaderWADOURi/TG18-LPH-2k-01.png',
    'TG_18-resolution-2k/TG18-LPV/TG18-LPV-2k-01.dcm':
      'dicomImageLoaderWADOURi/TG18-LPV-2k-01.png',
    'TG_18-resolution-2k/TG18-LPV/TG18-LPV-2k-02.dcm':
      'dicomImageLoaderWADOURi/TG18-LPV-2k-02.png',
    'TG_18-resolution-2k/TG18-LPV/TG18-LPV-2k-03.dcm':
      'dicomImageLoaderWADOURi/TG18-LPV-2k-03.png',
    'TG_18-resolution-2k/TG18-PX/TG18-PX-2k-01.dcm':
      'dicomImageLoaderWADOURi/TG18-PX-2k-01.png',
    'TG_18-resolution-2k/TG18-RH/TG18-RH-2k-01.dcm':
      'dicomImageLoaderWADOURi/TG18-RH-2k-01.png',
    'TG_18-resolution-2k/TG18-RH/TG18-RH-2k-02.dcm':
      'dicomImageLoaderWADOURi/TG18-RH-2k-02.png',
    'TG_18-resolution-2k/TG18-RH/TG18-RH-2k-03.dcm':
      'dicomImageLoaderWADOURi/TG18-RH-2k-03.png',
    'TG_18-resolution-2k/TG18-RV/TG18-RV-2k-01.dcm':
      'dicomImageLoaderWADOURi/TG18-RV-2k-01.png',
    'TG_18-resolution-2k/TG18-RV/TG18-RV-2k-02.dcm':
      'dicomImageLoaderWADOURi/TG18-RV-2k-02.png',
    'TG_18-resolution-2k/TG18-RV/TG18-RV-2k-03.dcm':
      'dicomImageLoaderWADOURi/TG18-RV-2k-03.png',
  },
};

export { screenShotPaths };
