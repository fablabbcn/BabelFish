// This file contains developer mode specific stuff. Include it at the
// top of browserify when developing BabelFish

var extensionSet;

// Send the extension id to the server to send correct config to the
// client. Kind of async but we have a backup and we will make many
// more requests to the server before useing the extensionId
function updateExtensionId (urls, config) {
  var xhr = new XMLHttpRequest(),
      ext = "extensionid",
      url = urls.shift();

  // Define it if you are an extension
  if (window.chrome && window.chrome.runtime && chrome.runtime.id)
    ext += "?extensionid="+ chrome.runtime.id;

  url = url.replace("*", ext);
  xhr.onreadystatechange = function () {
    if (extensionSet) return;
    if (xhr.readyState == 4 &&
        xhr.status == 200 &&
        xhr.responseText.length > 0) {
      config.extensionId = xhr.responseText;
      console.log("Extension id is:", config.extensionId, "based on", url);
      extensionSet = true;
    } else {
      console.log("Failed to get extension id from", url);
      if (urls.length) updateExtensionId(urls, config);
    }

  };

  try {
    xhr.open("GET", url, true);
    xhr.send();
  } catch (e) {
    ;
  }
}

window.codebenderChromeDeveleoperMode = true;
