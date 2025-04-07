import { MeshType } from '../../../enums';
import type { PublicMeshData } from '../../../types';

export function validateMesh(meshData: PublicMeshData): void {
  if (!meshData.id) {
    throw new Error('Mesh must have an id');
  }

  if (!meshData.arrayBuffer) {
    throw new Error('Mesh must have an arrayBuffer');
  }

  // check if format is one of the supported formats
  if (!(meshData.format in MeshType)) {
    throw new Error(
      `Mesh format must be one of the following: ${Object.values(MeshType).join(
        ', '
      )}`
    );
  }
}
