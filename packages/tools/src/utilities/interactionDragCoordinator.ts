type DragOwner = 'orientation-controller';

const dragOwnerByViewportId = new Map<string, DragOwner>();

export function beginOwnedDrag(viewportId: string, owner: DragOwner): boolean {
  if (dragOwnerByViewportId.has(viewportId)) {
    return false;
  }

  dragOwnerByViewportId.set(viewportId, owner);
  return true;
}

export function endOwnedDrag(viewportId: string, owner: DragOwner): void {
  if (dragOwnerByViewportId.get(viewportId) === owner) {
    dragOwnerByViewportId.delete(viewportId);
  }
}

export function isDragOwnedBy(viewportId: string, owner: DragOwner): boolean {
  return dragOwnerByViewportId.get(viewportId) === owner;
}
