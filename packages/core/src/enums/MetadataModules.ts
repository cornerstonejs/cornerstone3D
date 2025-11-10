/**
 * Contains the names for the metadata modules.
 * Recommendation is to add all module names here rather than having them
 * just use string names.
 * The naming convention is that the enum has the modules in it, so the
 * enum key does not repeat the Modules, but the enum value does (to agree
 * with existing naming conventions)
 */
enum MetadataModules {
  CALIBRATION = 'calibrationModule',
  CINE = 'cineModule',
  GENERAL_IMAGE = 'generalImageModule',
  GENERAL_SERIES = 'generalSeriesModule',
  GENERAL_STUDY = 'generalStudyModule',
  IMAGE_PIXEL = 'imagePixelModule',
  IMAGE_PLANE = 'imagePlaneModule',
  IMAGE_URL = 'imageUrlModule',
  MODALITY_LUT = 'modalityLutModule',
  MULTIFRAME = 'multiframeModule',
  NM_MULTIFRAME_GEOMETRY = 'nmMultiframeGeometryModule',
  OVERLAY_PLANE = 'overlayPlaneModule',
  PATIENT = 'patientModule',
  PATIENT_STUDY = 'patientStudyModule',
  PET_IMAGE = 'petImageModule',
  PET_ISOTOPE = 'petIsotopeModule',
  PET_SERIES = 'petSeriesModule',
  SOP_COMMON = 'sopCommonModule',
  ULTRASOUND_ENHANCED_REGION = 'ultrasoundEnhancedRegionModule',
  VOI_LUT = 'voiLutModule',
  /**
   * The frame module is used to get information on the number of frames
   * in the sop instance, and the current frame number, independently of the
   * registration method.
   */
  FRAME_MODULE = 'frameModule',
  /**
   * Some modules need direct access to a data services (WADO) web client.
   * This allows getting images and metadata as raw results for display.
   * This is DICOMweb WADO, not base WADO, and should support:
   *    * Series level metadata retrieve
   *    * Bulkdata retrieve
   *    * Image retrieve
   */
  WADO_WEB_CLIENT = 'wadoWebClient',

  /**
   * Some modules rely on an instance access to the full metadata.
   * WARNING: This may not be available or may be expensive to create, use
   * with caution.  If you can use the existing modules, that is recommended
   * instead.
   *
   */
  INSTANCE = 'instance',

  /**
   * There are some convenience methods to get partial metadata related to a
   * study referencing the existing one in various ways.
   * These are Normalized referenced, eg upper camel case references
   * used for creating new instance data.
   *
   * See the adapters package for standard methods to create these.
   */

  /** References a given frame*/
  IMAGE_SOP_INSTANCE_REFERENCE = 'ImageSopInstanceReference',
  REFERENCED_SERIES_REFERENCE = 'ReferencedSeriesReference',
}

export default MetadataModules;
