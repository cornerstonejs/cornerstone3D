
export type CornerstoneWadoLoaderLoadRequestFunction = (
  url: string,
  imageId: string,
  ...args: any[]
) => Promise<ArrayBuffer>;
