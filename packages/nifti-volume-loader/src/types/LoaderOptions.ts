export interface LoaderOptions {
  beforeSend?: (
    xhr: XMLHttpRequest,
    defaultHeaders: Record<string, string>,
    url: string
  ) => Record<string, string> | void;
}
