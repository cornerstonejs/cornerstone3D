import { IImage } from '../types';

const isPTPrescaledWithSUV = (image: IImage) => {
  return image.preScale?.scaled && image.preScale.scalingParameters?.suvbw;
};

export default isPTPrescaledWithSUV;
