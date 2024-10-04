export type LoadRequestFunction = (
  url: string,
  imageId: string,
  ...args: unknown[]
) => Promise<ArrayBuffer>;
