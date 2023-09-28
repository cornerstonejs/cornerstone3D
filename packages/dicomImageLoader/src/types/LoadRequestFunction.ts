export type LoadRequestFunction = (
  url: string,
  imageId: string,
  ...args: any[]
) => Promise<ArrayBuffer>;
