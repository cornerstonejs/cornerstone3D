// Interleave the list at the given interval
export default function interleave(list: [], interleave = 3) {
  const interleaveList = [];
  for (let offset = 0; offset < interleave; offset++) {
    for (let i = offset; i < list.length; i += interleave) {
      interleaveList.push(list[i]);
    }
  }
  return interleaveList;
}
