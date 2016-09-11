ImageIds
========

The image loader prefix is 'wadouri' (note that the prefix dicomweb is also supported but is deprecated and will eventually
be removed).  Here are some example imageId's:

absolute url:

```
wadouri:http://cornerstonetech.org/images/ClearCanvas/USEcho/IM00001
```

relative url:

```
wadouri:/images/ClearCanvas/USEcho/IM00001
```

WADO-URI url:

```
wadouri:http://localhost:3333/wado?requestType=WADO&studyUID=1.3.6.1.4.1.25403.166563008443.5076.20120418075541.1&seriesUID=1.3.6.1.4.1.25403.166563008443.5076.20120418075541.2&objectUID=1.3.6.1.4.1.25403.166563008443.5076.20120418075557.1&contentType=application%2Fdicom&transferSyntax=1.2.840.10008.1.2.1
```

[Orthanc](http://www.orthanc-server.com/) file endpoint URL:

```
wadouri:http://localhost:8042/instances/8cce70aa-576ad738-b76cb63f-caedb3c7-2b213aae/file
```

Note that the web server must support [Cross origin resource sharing](http://en.wikipedia.org/wiki/Cross-origin_resource_sharing)
or the image will fail to load.  If you are unable to get CORS enabled on the web server that you are loading DICOM P10
instances from, you can use a [reverse proxy](http://en.wikipedia.org/wiki/Reverse_proxy).  Here is a
[simple Node.js based http-proxy](http://chafey.blogspot.com/2014/09/working-around-cors.html) that adds CORS headers
that you might find useful.