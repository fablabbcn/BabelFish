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

	http.createServer(function(req, res) {
    var uri = url.parse(req.url).pathname;
    var filename = path.join(webroot, uri);
    fs.exists(filename, function(exists) {
      if(!exists) {
        console.log("not exists: " + filename);
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.write('404 Not Found\n');
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
	console.log('node-static running at http://localhost:%d', port);
}

StaticServer.prototype.stop = function () {
	this.srv.close();
};

exports.StaticServer = StaticServer;
if (require.main === module) {
  var srv = new StaticServer('.', 8080);
}
