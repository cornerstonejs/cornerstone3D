import ImageVolume from './ImageVolume'
import { IImageVolume, IStreamingVolume } from './../../types'

export default class StreamingImageVolume extends ImageVolume {
  readonly imageIds: Array<string>
  loadStatus: {
    loaded: boolean
    loading: boolean
    cachedFrames: Array<boolean>
    callbacks: Array<Function>
  }

  constructor(
    imageVolumeProperties: IImageVolume,
    streamingProperties: IStreamingVolume
  ) {
    super(imageVolumeProperties)

    this.imageIds = streamingProperties.imageIds
    this.loadStatus = streamingProperties.loadStatus
  }

  cancelLoading() {
    const { loadStatus } = this;

    if (!loadStatus || !loadStatus.loading) {
      return
    }

    // Set to not loading.
    loadStatus.loading = false

    // Remove all the callback listeners
    loadStatus.callbacks = []
  }
}
