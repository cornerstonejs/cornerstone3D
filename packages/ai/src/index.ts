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
  // Exported so an application can put the ONNX Runtime binaries somewhere
  // this cannot work out for itself - a CDN, a versioned path - by assigning
  // `ort.env.wasm.wasmPaths` before the controller runs. Serving them from the
  // same directory as the codec binaries needs nothing from here: set that
  // directory once, with `init({ wasmBasePath })` on the DICOM image loader.
  getOrtWasmPaths,
  DEFAULT_ORT_WASM_DIRECTORY,
};
