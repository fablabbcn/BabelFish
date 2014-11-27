var http = require('http'),
    url = require('url'),
    path = require('path'),
    fs = require('fs');

function StaticServer(webroot, port) {
  this.port = port || 8080;
  var mimeTypes = {
    "html": "text/html",
    "jpeg": "image/jpeg",
    "jpg": "image/jpeg",
    "png": "image/png",
    "js": "text/javascript",
    "css": "text/css"};

  this.srv = http.createServer(function(req, res) {
    var uri = url.parse(req.url).pathname;
    var filename = path.join(webroot, uri);
    fs.stat(filename, function(err, stats) {
      if(!stats || stats.isDirectory()) {
        res.writeHead(404, {'Content-Type': 'text/plain'});
        console.log("not exists (or is directory): " + filename);
        res.write("404: not exists (or is directory): " + filename);
        res.end();
	return;
      }
      var path = filename.split("."),
	  mimeType = mimeTypes[path[path.length - 1]];
      res.writeHead(200, {'Content-Type': mimeType});

      var fileStream = fs.createReadStream(filename);
      fileStream.pipe(res);

    }); //end path.exists
  }).listen(port);
  console.log('node-static running on http://localhost:%d', port);
}

StaticServer.prototype.stop = function () {
  this.srv.close();
};

exports.StaticServer = StaticServer;
if (require.main === module) {
  var srv = new StaticServer('.', 8080);
}
