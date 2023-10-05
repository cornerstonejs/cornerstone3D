// Interleave the list at the given interval
export default function interleave<T>(
  list: Array<T>,
  interleave = 3
): Array<T> {
  const interleaveList = [];
  for (let offset = 0; offset < interleave; offset++) {
    for (let i = offset; i < list.length; i += interleave) {
      interleaveList.push(list[i]);
    }
  }
  return interleaveList;
}
