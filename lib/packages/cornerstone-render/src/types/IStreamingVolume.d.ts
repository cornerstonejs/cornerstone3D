interface IStreamingVolume {
    imageIds: Array<string>;
    loadStatus: {
        loaded: boolean;
        loading: boolean;
        cachedFrames: Array<boolean>;
        callbacks: Array<() => void>;
    };
}
export default IStreamingVolume;
