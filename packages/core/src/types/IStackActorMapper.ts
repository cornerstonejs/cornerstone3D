import type { CPUIImageData, IImage, IImageData, IStackInput } from './index';

export default interface IStackActorMapper {
  reset(): void;
  getImageData(): IImageData | CPUIImageData | undefined;
  updateToDisplayImage(image: IImage): void;
  addImages(stackInputs: IStackInput[]): void;
}
