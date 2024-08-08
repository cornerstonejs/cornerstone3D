declare global {
  interface Window {
    crossOriginIsolated: unknown;
  }
}

export default global;
