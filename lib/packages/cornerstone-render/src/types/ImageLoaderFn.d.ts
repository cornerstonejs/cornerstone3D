declare type ImageLoaderFn = (imageId: string, options?: Record<string, any>) => {
    promise: Promise<Record<string, any>>;
    cancelFn?: () => void | undefined;
    decache?: () => void | undefined;
};
export default ImageLoaderFn;
