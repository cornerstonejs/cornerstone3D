declare global {
  interface Window {
    crossOriginIsolated: unknown;
    SharedArrayBuffer: unknown;
  }
}

export default global;
