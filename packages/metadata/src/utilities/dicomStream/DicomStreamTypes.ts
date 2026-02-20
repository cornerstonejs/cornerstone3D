export interface IDicomListener {
  parent: IDicomListener;
  dest?;

  addTag?: (tag: string, info?: IListenerInfo) => void | IDicomListener;
  values?: (array: unknown[]) => void;
  value?: (value: unknown) => void;

  pop?: () => unknown;
}

export interface IListenerInfo {
  vr?: string;
  length?: string;
  name?: string;
}
