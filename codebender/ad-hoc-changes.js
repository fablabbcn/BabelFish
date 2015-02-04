$(document).ready(function () {
  clearInterval(window.which_browser_interval);
  window.setTimeout(function () {
    if (typeof WhichBrowser !== 'undefined')
    {
      window.Browsers = new WhichBrowser();

      window.osBrowserIsSupported = function() {
        if(Browsers.isType("desktop"))
        {
          var osSupported = Browsers.isOs('Mac OS X') ||
                Browsers.isOs('Windows') ||
                Browsers.isOs('Unix') ||
                Browsers.isOs('FreeBSD') ||
                Browsers.isOs('OpenBSD') ||
                Browsers.isOs('NetBSD') ||
                Browsers.isOs('Solaris') ||
                Browsers.isOs('Linux') ||
                Browsers.isOs('Debian') ||
                Browsers.isOs('Fedora') ||
                Browsers.isOs('Gentoo') ||
                Browsers.isOs('gNewSense') ||
                Browsers.isOs('Kubuntu') ||
                Browsers.isOs('Mandriva') ||
                Browsers.isOs('Mageia') ||
                Browsers.isOs('Red Hat') ||
                Browsers.isOs('Slackware') ||
                Browsers.isOs('SUSE') ||
                Browsers.isOs('Turbolinux') ||
                Browsers.isOs('Ubuntu');

          var browserSupported = Browsers.isBrowser('Firefox') ||
                Browsers.isBrowser('Chrome', '>=', '39') ||
                Browsers.isBrowser('Chromium', '>=', '39');

          if(osSupported && browserSupported)
          {
            return true;
          }
        }

        if(osSupported && browserSupported)
        {
          return true;
        }
      }

      return false;
    };
  });
});
