// @ts-ignore // TODO -> There is a load of argument in the typescript community about this, but to set up
// webpack to use both js and ts you need to add ".ts" extensions to imports, which typescript otherwise warns about.
import ImageVolume from './ImageVolume.ts';
import { ImageVolumeInterface, StreamingInterface } from './interfaces';

export default class StreamingImageVolume extends ImageVolume {
  imageIds: Array<string>;
  loadStatus: {
    loaded: Boolean;
    loading: Boolean;
    cachedFrames: Array<Boolean>;
    callbacks: Array<Function>;
  };

  constructor(
    imageVolumeProperties: ImageVolumeInterface,
    streamingProperties: StreamingInterface
  ) {
    super(imageVolumeProperties);

    this.imageIds = streamingProperties.imageIds;
    this.loadStatus = streamingProperties.loadStatus;
  }
}
