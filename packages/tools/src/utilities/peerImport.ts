export function peerImport(moduleId) {
  if (moduleId === 'itk-wasm') {
    return import(/* webpackChunkName: "itk-wasm" */ 'itk-wasm');
  }
}

export default peerImport;
