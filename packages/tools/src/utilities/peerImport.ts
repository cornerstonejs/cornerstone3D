export async function peerImport(moduleId) {
  if (moduleId === 'itk-wasm') {
    return import('itk-wasm');
  }
}

export default peerImport;
