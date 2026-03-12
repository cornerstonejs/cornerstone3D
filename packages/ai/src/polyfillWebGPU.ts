/**
 * Polyfill for WebGPU adapters in browsers that removed requestAdapterInfo()
 * in favor of the adapter.info property. ONNX Runtime Web 1.18 may still call
 * requestAdapterInfo(); this ensures the method exists so WebGPU backend can load.
 *
 * Must be imported before any onnxruntime-web code (e.g. before initOrtEnv).
 */

// Use a loose type for the adapter so we can add requestAdapterInfo without conflicting with GPUAdapter
type AdapterLike = GPUAdapter & {
  requestAdapterInfo?: () => Promise<GPUAdapterInfo>;
  info?: GPUAdapterInfo;
};

function polyfillWebGPUAdapter(): void {
  if (typeof navigator === 'undefined' || !navigator.gpu?.requestAdapter) {
    return;
  }
  const origRequestAdapter = navigator.gpu.requestAdapter.bind(navigator.gpu);
  navigator.gpu.requestAdapter = function (
    options?: GPURequestAdapterOptions
  ): Promise<GPUAdapter | null> {
    return origRequestAdapter(options).then((adapter) => {
      const a = adapter as AdapterLike | null;
      if (a && typeof a.requestAdapterInfo !== 'function') {
        a.requestAdapterInfo = function (
          this: AdapterLike
        ): Promise<GPUAdapterInfo> {
          const info =
            this.info ??
            ({
              vendor: '',
              architecture: '',
              device: '',
              description: '',
            } as GPUAdapterInfo);
          return Promise.resolve(info);
        };
      }
      return adapter;
    });
  };
}

polyfillWebGPUAdapter();
