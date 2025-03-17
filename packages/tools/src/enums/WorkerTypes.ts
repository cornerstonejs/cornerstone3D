/**
 * Worker Types are used to define the types the worker that is getting performed
 */
enum ChangeTypes {
  POLYSEG_CONTOUR_TO_LABELMAP = 'Converting Contour to Labelmap',

  POLYSEG_SURFACE_TO_LABELMAP = 'Converting Surfaces to Labelmap',

  POLYSEG_CONTOUR_TO_SURFACE = 'Converting Contour to Surface',

  POLYSEG_LABELMAP_TO_SURFACE = 'Converting Labelmap to Surface',

  SURFACE_CLIPPING = 'Clipping Surfaces',

  COMPUTE_STATISTICS = 'Computing Statistics',

  INTERPOLATE_LABELMAP = 'Interpolating Labelmap',

  COMPUTE_LARGEST_BIDIRECTIONAL = 'Computing Largest Bidirectional',
}

export default ChangeTypes;
