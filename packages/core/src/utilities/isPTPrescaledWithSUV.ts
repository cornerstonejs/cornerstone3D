import type { IImage } from '../types';

const isPTPrescaledWithSUV = (image: IImage): boolean => {
  return Boolean(
    image.preScale?.scaled && image.preScale?.scalingParameters?.suvbw
  );
};

export default isPTPrescaledWithSUV;
