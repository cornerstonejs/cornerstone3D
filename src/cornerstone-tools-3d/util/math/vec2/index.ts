import findClosestPoint from './findClosestPoint';

// TODO move this to a math library? CornerstoneMath as it is now seems less useful since vtkjs uses
// Array style coordinates everhere and we use gl-matrix heavily.
// Additionally its functions don't tell us its 2D which I think could be really confusin since we need both 2D and 3D?

export default { findClosestPoint };
