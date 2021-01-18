type ImageLoaderFn = (
  imageId: string,
  options?: Record<string, any>
) => {
  promise: Promise<Record<string, any>>
  cancelFn: () => void | undefined
}

export default ImageLoaderFn
