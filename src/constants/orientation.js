const ORIENTATION = {
  AXIAL: {
    sliceNormal: [0, 0, 1],
    viewUp: [0, -1, 0],
  },
  SAGITTAL: {
    sliceNormal: [1, 0, 0],
    viewUp: [0, 0, 1],
  },
  CORONAL: {
    sliceNormal: [0, 1, 0],
    viewUp: [0, 0, 1],
  },
};

export default ORIENTATION;
