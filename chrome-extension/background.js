chrome.app.runtime.onLaunched.addListener(function() {
  chrome.app.window.create('app-page/index.html', {
    'width': 500,
    'height': 400
  });
});
