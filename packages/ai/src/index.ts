import ONNXSegmentationController from './ONNXSegmentationController';
import LabelmapSlicePropagationTool from './LabelmapSlicePropagationTool';
import MarkerLabelmapTool from './MarkerLabelmapTool';
import { Events } from './enums';
import getOrtWasmPaths, {
  DEFAULT_ORT_WASM_DIRECTORY,
} from './utils/getOrtWasmPaths';

export {
  ONNXSegmentationController,
  LabelmapSlicePropagationTool,
  MarkerLabelmapTool,
  Events,
  // Exported to answer where the ONNX Runtime binaries will be looked for, not
  // to configure it: the location comes from `init({ wasmBasePath })` on the
  // DICOM image loader, from `PUBLIC_URL`, or from assigning
  // `ort.env.wasm.wasmPaths` directly, which the controller leaves alone.
  getOrtWasmPaths,
  DEFAULT_ORT_WASM_DIRECTORY,
};
