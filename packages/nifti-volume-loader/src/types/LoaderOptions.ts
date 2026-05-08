export interface LoaderOptions {
  beforeSend?: (
    xhr: XMLHttpRequest,
    defaultHeaders: Record<string, string>,
    url: string
  ) => Promise<Record<string, string> | void> | Record<string, string> | void;
}
