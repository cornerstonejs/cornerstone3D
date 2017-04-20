function checkToken(token, data, dataOffset) {

  if(dataOffset + token.length > data.length) {
    return false;
  }

  var endIndex = dataOffset;

  for(var i = 0; i < token.length; i++) {
    if(token[i] !== data[endIndex++]) {
      return false;
    }
  }
  return true;
}

function stringToUint8Array(str) {
  var uint=new Uint8Array(str.length);
  for(var i=0,j=str.length;i<j;i++){
    uint[i]=str.charCodeAt(i);
  }
  return uint;
}

function findIndexOfString(data, str, offset) {

  offset = offset || 0;

  var token = stringToUint8Array(str);

  for(var i=offset; i < data.length; i++) {
    if(token[0] === data[i]) {
      //console.log('match @', i);
      if(checkToken(token, data, i)) {
        return i;
      }
    }
  }
  return -1;
}
export default findIndexOfString;
