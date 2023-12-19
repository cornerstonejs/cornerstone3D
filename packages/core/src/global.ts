declare global {
  interface Window {
    crossOriginIsolated: boolean;
    SharedArrayBuffer: unknown;
  }
}

export default global;
