/**
 * Contains the names for the metadata modules.
 * Recommendation is to add all module names here rather than having them
 * just use string names.
 * The naming convention is that the enum has the modules in it, so the
 * enum key does not repeat the Modules, but the enum value does (to agree
 * with existing naming conventions)
 */
export enum MetadataModules {
  CALIBRATION = 'calibrationModule',
  CINE = 'cineModule',
  FRAME_OF_REFERENCE = 'frameOfReferenceModule',
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

  /** Transfer syntax information*/
  TRANSFER_SYNTAX = 'transferSyntax',

  /*
   * Functional groups are the metadata modules defines for functional group
   * sequences.  Note these are UPPER camel case to agree with normalized
   * representations so that the data is directly usable from shared/per frame
   * sequences.
   */

  /** Functional group for the plane orientation */
  PLANE_ORIENTATION = 'PlaneOrientation',

  /** Functional group for the plat position */
  PLANE_POSITION = 'PlanePosition',

  /** Functional group for pixel measures */
  PIXEL_MEASURES = 'PixelMeasures',

  /** Functional group for xray geometry */
  XRAY_GEOMETRY = 'XrayGeometry',

  /** Functional group frame pixel data */
  FRAME_PIXEL_DATA = 'FramePixelData',

  /**
   * The frame module is used to get information on the number of frames
   * in the sop instance, and the current frame number, independently of the
   * registration method.
   */
  FRAME_MODULE = 'frameModule',
  /**
   * The uriModule provides just basic information extractable from the URI.
   * At a minimum, this shall include the frame number being referenced
   * This is closely related to the frame module, but the frame module includes
   * additional information.
   */
  URI_MODULE = 'uriModule',

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

  /**
   * A DICOM_SOURCE data is an instance that can send messages to a destination
   * listener.  These will typically be in a format like:
   *    - Part 10 Binary DICOM
   *    - DICOMweb metadata
   *    - Naturalized metadata
   *    - DataSet parsed data
   *
   * These will then be iterated over to send messages to the listener that then
   * goes ahead and creates the final object.
   *
   * This is basically an automated way of converting different image types to
   * the shared/standardized format.
   */
  DICOM_SOURCE = 'DICOMSource',
  /**
   * The Instance ORIG is the original version of the instance data
   * This is used as the source for creating other metadata modules from
   * the instance data, as opposed to the instance version, which could be
   * created from the modules.
   *
   * Every frame of a multiframe should have the same instanceOrig value.
   */
  INSTANCE_ORIG = 'instanceOrig',
}

export default MetadataModules;
