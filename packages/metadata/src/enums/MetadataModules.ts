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
  /** @deprecated Prefer PATIENT; alias for legacy WADO image loader tag name */
  PATIENT_DEMOGRAPHIC = 'patientDemographicModule',
  PATIENT_STUDY = 'patientStudyModule',
  PET_IMAGE = 'petImageModule',
  PET_ISOTOPE = 'petIsotopeModule',
  PET_SERIES = 'petSeriesModule',
  /** SUV/dose scaling derived from instance (PT: suvbw/suvlbm/suvbsa; RTDOSE: DoseGridScaling etc.) */
  SCALING = 'scalingModule',
  SOP_COMMON = 'sopCommonModule',
  ULTRASOUND_ENHANCED_REGION = 'ultrasoundEnhancedRegionModule',
  ECG = 'ecgModule',
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
   * The instance data is a single per-frame object data that has per-frame
   * computed data already added and combined into a single object.
   * This object may NOT be iterable for attributes within it, because it
   * uses inheritance to combine different levels of the data.
   *
   * In the legacy metadata modules, this could be a call time generated object
   * where it combines all the individual modules back into an instance.  However,
   * in the newer metadata module, this is a base object used to create other modules
   * assuming this item has already been stored.
   *
   * Typically this object will be created from the 'natural' object using the
   * combineFramesInstance utility function.
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
   * Compressed frame data: transferSyntaxUid, frameOfInterest, frameNumber,
   * and pixelData (from NATURALIZED when available). Use getMetaData(MetadataModules.COMPRESSED_FRAME_DATA, imageId, { frameIndex }).
   */
  COMPRESSED_FRAME_DATA = 'compressedFrameData',
  /** Canonical base imageId derived from a frame-specific or base imageId query. */
  BASE_IMAGE_ID = 'baseImageId',
  /** Frame imageIds resolved/generated for a base imageId query. */
  FRAME_IMAGE_IDS = 'frameImageIds',

  /**
   * The natural metadata is the naturalized instance data without any frame
   * references/per-frame data added.
   *
   * This is an upper camel case DICOM tag name object, where VM=1 attributes or
   * VM=0-1 attributes are represented by a single object vlaue instead of an array.
   * All other attribute values are represented as an array.
   *
   * For example:
   *
   * ```
   * {
   *   PatientName: 'Doe^John',
   *   PatientID: '1234567890',
   *   ModalitiesInStudy: ['CT', 'MR'],
   * }
   * ```
   * Every frame of a multiframe should have the same natural value.
   * The per-frame data object is generated from the natural value object - see INSTANCE
   */
  NATURALIZED = 'naturalized',
}

export const ADD_MODULE_TYPE_SUFFIX = 'Add';

/**
 * Returns the add-path module type for a base metadata module.
 *
 * The metadata add pipeline registers providers under a derived module name
 * (e.g. `naturalizedAdd`) so ingestion handlers can be isolated from read-path
 * `get` providers.
 */
export function getAddModuleType(type: string) {
  return `${type}${ADD_MODULE_TYPE_SUFFIX}`;
}

export default MetadataModules;
