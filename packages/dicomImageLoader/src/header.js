//
// This is a cornerstone image loader for WADO-URI requests.  It has limited support for compressed
// transfer syntaxes, check here to see what is currently supported:
//
// https://github.com/chafey/cornerstoneWADOImageLoader/blob/master/docs/TransferSyntaxes.md
//
// It will support implicit little endian transfer syntaxes but explicit little endian is strongly preferred
// to avoid any parsing issues related to SQ elements.  To request that the WADO object be returned as explicit little endian, append
// the following on your WADO url: &transferSyntax=1.2.840.10008.1.2.1
//

if(typeof cornerstone === 'undefined'){
  cornerstone = {};
}
if(typeof cornerstoneWADOImageLoader === 'undefined'){
  cornerstoneWADOImageLoader = {
    internal: {
      options : {
        // callback allowing customization of the xhr (e.g. adding custom auth headers, cors, etc)
        beforeSend: function (xhr) {
        }
      },
      multiFrameCacheHack : {}
    }
  };
}

