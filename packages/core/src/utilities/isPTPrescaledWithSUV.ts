import { IImage } from '../types/index.js';

const isPTPrescaledWithSUV = (image: IImage) => {
  return image.preScale?.scaled && image.preScale.scalingParameters?.suvbw;
};

export default isPTPrescaledWithSUV;
