/**
 * Configure ONNX Runtime Web logging before any session is created.
 *
 * - ort.env.logLevel is the only global; it is passed to initOrt() (native) and
 *   configureLogger() (JS) when the runtime/backend initializes. Set it to 'error'
 *   to suppress warning-level messages.
 * - There is no public API to call configureLogger or setLevel directly; the library
 *   reads ort.env.logLevel at init time.
 * - In some builds (e.g. 1.17.x), native constant_folding / execution-provider
 *   warnings may still appear (see e.g. microsoft/onnxruntime#17377). Upgrading
 *   onnxruntime-web (e.g. to 1.18+) may improve this.
 *
 * WebGPU: We use onnxruntime-web/webgpu so the WebGPU backend is available.
 * polyfillWebGPU runs first so browsers that removed requestAdapterInfo() still work.
 */
import './polyfillWebGPU';
// @ts-ignore - onnxruntime-web/webgpu has no types
import ort from 'onnxruntime-web/webgpu';

if (typeof ort !== 'undefined' && ort?.env) {
  ort.env.logLevel = 'error';
}
