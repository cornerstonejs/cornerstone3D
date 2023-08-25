import Point2 from './Point2';

type IVideo = {
  loop?: boolean;
  muted?: boolean;
  pan?: Point2;
  // The zoom factor, naming consistent with vtk cameras for now,
  // but this isn't necessarily necessary.
  parallelScale?: number;
};

export default IVideo;
