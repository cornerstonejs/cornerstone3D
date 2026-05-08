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
  ECG = 'ecgModule',
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

  /**
   * Reference object for the frame of the imageId provided
   */
  IMAGE_SOP_INSTANCE_REFERENCE = 'ImageSopInstanceReference',
  /**
   * Reference object starting with the series to the sop instance
   * provided.
   *
   * This will likely need to be merged with other series references
   */
  REFERENCED_SERIES_REFERENCE = 'ReferencedSeriesReference',

  /**
   * Creates a predecessor sequence to indicate the new object replaces
   * the old one.
   *
   * Also includes the series level attributes that this object has
   * in order to allow placing the new instance into the same series.
   */
  PREDECESSOR_SEQUENCE = 'PredecessorSequence',

  /**
   * The study data module contains the normalized values associated with the
   * study header, including StudyInstanceUID, PatientID and the other cross-
   * study information.
   *
   * This should be used as a basis for adding a new series to an existing study.
   */
  STUDY_DATA = 'StudyData',
  /**
   * The Series Data module contains the normalized values associated with the
   * series object, PLUS the study instance uid.
   *
   * This should be combined with the study data to add new instances to an
   * existing series.
   */
  SERIES_DATA = 'SeriesData',

  /**
   * The image data module has the image specific information associated with
   * the image frame of interest.
   *
   * This is used when modifying study structure such as creating a multiframe
   * reference used internally for segmentation.
   */
  IMAGE_DATA = 'ImageData',

  /**
   * Static data for various header initialization.
   * This change allows writing a custom provider to replace the metadata
   * either on a per-instance basis or the default data.
   */
  /**
   * The basic header data for new RTSS instances
   */
  RTSS_INSTANCE_DATA = 'RtssInstanceData',
  /**
   * Generic new instance data, including study and new series instance data.
   */
  NEW_INSTANCE_DATA = 'NewInstanceData',

  /**
   * Meta module providers return the _meta field for a new instance
   */
  /** Metadata module for RTSS contour */
  RTSS_CONTOUR = 'metaRTSSContour',
  /** Metadata module for single bit segmentation */
  SEG_BIT = 'metaSegBitmap',
  /** Metadata module for RTSS annotations */
  SR_ANNOTATION = 'metaSrAnnotation',
}

export default MetadataModules;
