import $ from 'jquery';
import parseImageId from './parseImageId';
import fileManager from './fileManager';

"use strict";

function loadFileRequest(uri) {
  var parsedImageId = parseImageId(uri);
  var fileIndex = parseInt(parsedImageId.url);
  var file = fileManager.get(fileIndex);
  
  // create a deferred object
  var deferred = $.Deferred();

  var fileReader = new FileReader();
  fileReader.onload = function (e) {
    var dicomPart10AsArrayBuffer = e.target.result;
    deferred.resolve(dicomPart10AsArrayBuffer);
  };
  fileReader.readAsArrayBuffer(file);

  return deferred.promise();
}

export default loadFileRequest;
