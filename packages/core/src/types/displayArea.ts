import InterpolationType from '../enums/InterpolationType';

type DisplayArea = {
  type?: 'SCALE' | 'FIT';
  scale?: number;
  interpolationType?: InterpolationType;
  imageArea?: [number, number]; // areaX, areaY
  imageCanvasPoint?: {
    imagePoint: [number, number]; // imageX, imageY
    canvasPoint?: [number, number]; // canvasX, canvasY
  };
  storeAsInitialCamera?: boolean;
};

export default DisplayArea;
