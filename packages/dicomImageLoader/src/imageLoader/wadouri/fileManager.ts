let files: Blob[] = [];

function add(file: Blob): string {
  const fileIndex = files.push(file);

  return `dicomfile:${fileIndex - 1}`;
}

function get(index: number): Blob {
  return files[index];
}

function remove(index: number): void {
  files[index] = undefined;
}

function purge(): void {
  files = [];
}

export default {
  add,
  get,
  remove,
  purge,
};
