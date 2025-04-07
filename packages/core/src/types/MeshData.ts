import type { MeshType } from '../enums';
import type Point3 from './Point3';

type PublicMeshData = MeshData;

interface MeshData {
  id: string;
  format: MeshType;
  arrayBuffer?: ArrayBuffer;
  color?: Point3;
  materialUrl?: string;
}

export type { PublicMeshData, MeshData };
