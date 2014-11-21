// XXXXX: REMOVE ME
$.get = function () {};

function EventManager () {
  this._listeners = {};
}

EventManager.prototype = {
  addListener: function(type, listener) {
    if (typeof this._listeners[type] == "undefined"){
      this._listeners[type] = [];
    }

    this._listeners[type].push(listener);
  },

  fire: function(event, param1, param2) {

    if (typeof event == "string"){
      event = { type: event };
    }
    if (!event.target) {
      event.target = this;
    }

    if (!event.type) {
      throw new Error("Event object missing 'type' property.");
    }

    if (this._listeners[event.type] instanceof Array){
      var listeners = this._listeners[event.type];
      for (var i=0, len=listeners.length; i < len; i++){

        if(typeof param1 !== 'undefined')
        {

          if(typeof param2 !== 'undefined')
          {
            listeners[i].call(this, param1, param2);
          }
          else
          {
            listeners[i].call(this, param1);
          }
        }
        else
        {
          listeners[i].call(this);
        }
      }
    }
  },

  removeListener:  function(type, listener){
    if (this._listeners[type] instanceof Array){
      var listeners = this._listeners[type];
      for (var i=0, len=listeners.length; i < len; i++){
        if (listeners[i] === listener){
          listeners.splice(i, 1);
          break;
        }
      }
    }
  }
};

function PluginHandler (owner) {
  // The compilerflasher object
  this.owner = owner;
  this.max_monitor_length = 5000;
  this.tabID = this.uuid4();
  this.initializePlugin();
}

PluginHandler.prototype = {
  uuid4: function () {
    var d = new Date().getTime();
    var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = (d + Math.random()*16)%16 | 0;
      d = Math.floor(d/16);
      return (c=='x' ? r : (r&0x7|0x8)).toString(16);
    });
    return uuid;
  },

  doflashBootloader: function(programmer, board)
  {
    this.plugin_.flashBootloader(
      (this.portslist.selectedIndex == -1 || programmer['communication'] != 'serial')?'':this.portslist.options[this.portslist.selectedIndex].text,
      programmer['protocol'],
      programmer['communication'],
      programmer['speed'],
      programmer['force'],
      programmer['delay'],
      board['bootloader']['high_fuses'],
      board['bootloader']['low_fuses'],
      (typeof board['bootloader']['extended_fuses'] === "undefined")?'':board['bootloader']['extended_fuses'],
      (typeof board['bootloader']['unlock_bits'] === "undefined")?'':board['bootloader']['unlock_bits'],
      (typeof board['bootloader']['lock_bits'] === "undefined")?'':board['bootloader']['lock_bits'],
      board['build']['mcu'],
      bootloader_callback
    );
  },

  clickedPort: function()
  {
    var port = $("#cb_cf_ports option:selected").text();
    url = "{{  url('CodebenderUtilitiesBundle_logdb', {actionid : 43 , meta: 'CLICK_PORT_META'}) }}";
    url = url.replace("CLICK_PORT_META", JSON.stringify({ "selectedPort": port, "tabID": this.tabID } ));
    $.get(url);
  },

  savePort: function(port) {
    var cb = this;
    if(typeof Lawnchair !== "undefined")
    {


      new Lawnchair(function () {
        if(port === undefined)
          port = $("#cb_cf_ports option:selected").text();

        this.save({key:'port', name:port});

        var oldPort = ((typeof cb.loaded_port === 'undefined') ? "" : cb.loaded_port);

        cb.loaded_port = port;

        var newPort = cb.loaded_port;
        url = "{{  url('CodebenderUtilitiesBundle_logdb', {actionid : 38 , meta: 'SAVEPORTMETA'}) }}";
        url = url.replace("SAVEPORTMETA", JSON.stringify({ "oldPort":oldPort, "newPort": newPort, "tabID": this.tabID } ));
        $.get(url);
      });}
    else
    {
      var oldPort = ((typeof cb.loaded_port === 'undefined') ? "" : cb.loaded_port);

      cb.loaded_port = port;

      var newPort = cb.loaded_port;
      url = "{{  url('CodebenderUtilitiesBundle_logdb', {actionid : 38 , meta: 'SAVEPORTMETA'}) }}";
      url = url.replace("SAVEPORTMETA", JSON.stringify({ "oldPort":oldPort, "newPort": newPort, "tabID": this.tabID } ));
      $.get(url);
    }

  },

  loadPort: function() {
    var cb = this;
    if(typeof Lawnchair !== "undefined")
    {
      Lawnchair(function () {
        this.exists('port', function (exists) {
          if (exists) {
            this.get('port', function (config) {
              $("#cb_cf_ports").val(config.name);
              cb.loaded_port = config.name;
            })

          }
        });
      });

    }
  },

  initializePlugin: function() {
    var url = '';
    var location = '';

    if (typeof window.location.origin === undefined)
      location = window.location;
    else
      location = window.location.origin;

    if (location.indexOf("codebender.cc") != -1 && !window.osBrowserIsSupported() )
    {
      url = "{{  url('CodebenderUtilitiesBundle_logdb', {actionid : 35 , meta: 'PLUGIN_META'}) }}";
      url = url.replace("PLUGIN_META", JSON.stringify({ "plugin" : false, "message": "Unsupported OS/browser combination."} ));
      $.get(url);

      if((Browsers.isOs('Mac OS X') ||  Browsers.isOs('Windows')))
      {
        this.owner.setOperationOutput('<i class="icon-warning-sign"></i> To program your Arduino from your browser, please use <a href="http://www.google.com/chrome/" target="_blank">Google Chrome</a> or <a href="http://www.mozilla.org/en-US/firefox/" target="_blank">Mozilla Firefox</a>.');
        this.owner.eventManager.fire('plugin_notification', '<i class="icon-warning-sign"></i> To program your Arduino from your browser, please use <a href="http://www.google.com/chrome/" target="_blank">Google Chrome</a> or <a href="http://www.mozilla.org/en-US/firefox/" target="_blank">Mozilla Firefox</a>.');
      } else if ((Browsers.isOs('Unix') || Browsers.isOs('FreeBSD') || Browsers.isOs('OpenBSD') || Browsers.isOs('NetBSD') || Browsers.isOs('Solaris') || Browsers.isOs('Linux') ||
                  Browsers.isOs('Debian') || Browsers.isOs('Fedora') || Browsers.isOs('Gentoo') || Browsers.isOs('gNewSense') || Browsers.isOs('Kubuntu') || Browsers.isOs('Mandriva') ||
                  Browsers.isOs('Mageia') || Browsers.isOs('Red Hat') || Browsers.isOs('Slackware') || Browsers.isOs('SUSE') || Browsers.isOs('Turbolinux') || Browsers.isOs('Ubuntu'))) {
        this.owner.setOperationOutput('<i class="icon-warning-sign"></i> To program your Arduino from your browser, please use <a href="http://www.google.com/chrome/" target="_blank">Google Chrome (up to version 34 on Linux)</a> or <a href="http://www.mozilla.org/en-US/firefox/" target="_blank">Mozilla Firefox</a>.');
        this.owner.eventManager.fire('plugin_notification', '<i class="icon-warning-sign"></i> To program your Arduino from your browser, please use <a href="http://www.google.com/chrome/" target="_blank">Google Chrome (up to version 34 on Linux)</a> or <a href="http://www.mozilla.org/en-US/firefox/" target="_blank">Mozilla Firefox</a>.');
      } else {
        this.owner.setOperationOutput('<i class="icon-warning-sign"></i> To program your Arduino from your browser, please use <a href="http://www.google.com/chrome/" target="_blank">Google Chrome</a> or <a href="http://www.mozilla.org/en-US/firefox/" target="_blank">Mozilla Firefox</a> from Windows, Mac or Linux.');
        this.owner.eventManager.fire('plugin_notification','<i class="icon-warning-sign"></i> To program your Arduino from your browser, please use <a href="http://www.google.com/chrome/" target="_blank">Google Chrome</a> or <a href="http://www.mozilla.org/en-US/firefox/" target="_blank">Mozilla Firefox</a> from Windows, Mac or Linux.');
      }
    } else {
      this.plugin_searched = false;
      this.plugin_found = false;
      this.plugin_initialized = false;
      this.plugin_validated = false;
      this.plugin_running = false;

      this.plugin_version = null;
      window.plugin_version = null;

      this.searchPlugin();

      if (!this.plugin_found)
      {
        var alert = this.browserSpecificPluginInstall("To program your Arduino from your browser, install the Codebender Plugin. ");
        this.owner.setOperationOutput(alert);
        this.owner.eventManager.fire('plugin_notification', alert);

        url = "{{  url('CodebenderUtilitiesBundle_logdb', {actionid : 35 , meta: 'PLUGIN_META'}) }}";
        url = url.replace("PLUGIN_META", JSON.stringify({ "plugin" : false, "message": "Not on navigator plugins."} ));
        $.get(url);
        window.pluginSearchInterval = setInterval(function(){
          this.searchPlugin();
          if (this.plugin_found) {
            clearInterval(window.pluginSearchInterval);
            this.runPlugin();
          }
        }.bind(this), 2000);
        return;
      } else {
        this.runPlugin();
      }

    }

  },

  searchPlugin: function() {
    if (chrome && chrome.serial) {
      this.plugin_found = true;
      this.plugin_searched = true;
    } else {
      for (var i = 0; i < navigator.plugins.length; i++)
	if (navigator.plugins[i].name == "Codebender.cc" || navigator.plugins[i].name == "Codebendercc")
          this.plugin_found = true;
      this.plugin_searched = true;
    }
  },

  runPlugin: function() {
    url = "{{  url('CodebenderUtilitiesBundle_logdb', {actionid : 35 , meta: 'PLUGIN_META'}) }}";
    url = url.replace("PLUGIN_META", JSON.stringify({ "plugin" : true, "message": "Found on navigator plugins."} ));
    $.get(url);

    if (this.owner){
      this.owner.setOperationOutput("<i class='icon-spinner icon-spin'></i>  Initializing Plugin... Make sure that you allow plugin execution on your browser. <a href='http://codebender.uservoice.com/knowledgebase/topics/57328-plugin'>More Info</a>");
      this.owner.eventManager.fire("plugin_notification", "<i class='icon-spinner icon-spin'></i>  Initializing Plugin... Make sure that you allow plugin execution on your browser. <a href='http://codebender.uservoice.com/knowledgebase/topics/57328-plugin'>More Info</a>");
      // $("body").append('<object id="plugin0" type="application/x-codebendercc" width="0" height="0" xmlns="http://www.w3.org/1999/html"></object>');
    }
    // XXX: Maybe uninitialize a previous plugin. C++ should be able to handle this case though.
    this.plugin_ = new Plugin();

    var self = this;
    function waitForPlugin_ () {
      if(typeof self.plugin_.probeUSB !== 'undefined')
      {
	console.log("Found plugin");
        self.plugin_initialized = true;
        self.plugin_version = self.plugin_.version;
        window.plugin_version = self.plugin_version;
        url = "{{  url('CodebenderUtilitiesBundle_logdb', {actionid : 35, meta: 'PLUGIN_META'}) }}";
        url = url.replace("PLUGIN_META", JSON.stringify({ "plugin" : true, "version": self.plugin_.version}) );
        $.get(url);

        self.validateVersion(self.minVersion);
        if (typeof self.plugin_.setErrorCallback !== 'undefined')
          self.plugin_.setErrorCallback(self.plugin_error_logger);

	if (typeof self.plugin_.init !== 'undefined')
	{
	  self.plugin_.init();
          if (self.plugin_.instance_id != 'undefined') {
            self.tabID = parseInt(self.plugin_.instance_id);
          }
	}

	if (typeof self.plugin_.closeTab !== 'undefined')
	{
	  $( window ).unload(function ()
		             {
			       self.plugin_.closeTab();
			       self.plugin_.deleteMap();
		             });
	} else {
	  self.disconnect();
	}
      } else {
	setTimeout(waitForPlugin_, 500);
      }
    }
    waitForPlugin_();
  },

  showPlugin: function() {
    this.owner.setOperationOutput("");
    this.owner.eventManager.fire("plugin_running");
    $.each(this.owner.loaded_elements, function(k,v){
      if(v !== "cb_cf_boards")
        $("#"+v).removeAttr("disabled");
    });
    this.plugin_running = true;
  },

  parseVersionString: function(str) {
    if (typeof(str) != 'string') {
      return false;
    }
    var x = str.split('.');
    // parse from string or default to 0 if can't parse
    var maj = parseInt(x[0]) || 0;
    var min = parseInt(x[1]) || 0;
    var pat = parseInt(x[2]) || 0;
    var bui = parseInt(x[3]) || 0;
    return {
      major:maj,
      minor:min,
      patch:pat,
      build:bui
    };
  },

  comparePluginVersions: function(firstVersion, secondVersion) {
    var major = firstVersion.major - secondVersion.major;
    var minor = firstVersion.minor - secondVersion.minor;
    var patch = firstVersion.patch - secondVersion.patch;
    var build = firstVersion.build - secondVersion.build;

    if (major != 0) return major;
    if (minor != 0) return minor;
    if (patch != 0) return patch;
    return build;
  },

  validateVersion: function(version) {
    if (this.comparePluginVersions(this.parseVersionString(this.plugin_.version), this.parseVersionString(version)) < 0 &&
	!(chrome && chrome.serial))
    {
      var alert = this.browserSpecificPluginInstall("You need to update the Codebender Plugin. ");
      this.owner.setOperationOutput(alert);
      this.owner.eventManager.fire('plugin_notification', alert);
      url = "{{  url('CodebenderUtilitiesBundle_logdb', {actionid : 27 , meta: 'PLUGIN_META'}) }}";
      url = url.replace("PLUGIN_META", JSON.stringify({ "success": true, "plugin" : false, "alert" : $("#alertupdatediv").html()}) );
      $.get(url);
      clearInterval(window.PluginLoggingInterval);
    } else if (this.plugin_.version == null){
      var alert = this.browserSpecificPluginInstall("To program your Arduino from your browser, install the Codebender Plugin. ");
      this.owner.setOperationOutput(alert);
      this.owner.eventManager.fire('plugin_notification', alert);
      url = "{{  url('CodebenderUtilitiesBundle_logdb', {actionid : 27 , meta: 'PLUGIN_META'}) }}";
      url = url.replace("PLUGIN_META", JSON.stringify({ "success": true, "plugin" : false, "alert" : $("#alertupdatediv").html()}) );
      $.get(url);
      clearInterval(window.PluginLoggingInterval);
    } else {
      this.enableUSB();
      this.initializePluginPortsLogger();
      this.showPlugin();
    }
    this.plugin_validated = true;
  },

  initializePluginPortsLogger: function() {
    if (typeof portsAvail === "undefined")
      portsAvail = [""];
    window.oldPortsAvail = portsAvail;

    if (typeof serialPortsAvail === "undefined")
      serialPortsAvail = [""];
    window.oldSerialPortsAvail = serialPortsAvail;

    var pl = this;
    window.PluginLoggingInterval = setInterval(function(){
      try
      {
        if(typeof(this.plugin_.probeUSB) === "undefined")
        {
          url = "{{  url('CodebenderUtilitiesBundle_logdb', {actionid : 34 , meta: 'PLUGIN_META'}) }}";
          url = url.replace("PLUGIN_META", JSON.stringify({ "message" : "Non catchable plugin crash.", "version": (window.plugin_version === 'undefined' || window.plugin_version === null) ? "undefined" : window.plugin_version,
							    "OS": { "name": (typeof Browsers.os.name === 'undefined') ? 'undefined' : Browsers.os.name,
								    "url":  window.location.pathname,
								    "version": (Browsers.os.version == null || typeof Browsers.os.version.original === 'undefined') ? 'undefined' : Browsers.os.version.original }, "Browser": { "name": (typeof Browsers.browser.name === 'undefined') ? 'undefined' : Browsers.browser.name,
																												 "version": (typeof Browsers.browser.version === 'undefined' || Browsers.browser.version == null) ? 'undefined' : Browsers.browser.version.original} }) );
          $.get(url);
          clearInterval(window.PluginLoggingInterval);
        }
        else
        {
          if ((typeof this.plugin_.availablePorts === 'undefined')
	      && ((oldPortsAvail.length < portsAvail.length
		   || (oldPortsAvail.length == 1 && portsAvail.length == 1 && oldPortsAvail[0] == "" && portsAvail[0] != ""))
                  ||(oldPortsAvail.length > portsAvail.length || (oldPortsAvail.length == 1 && portsAvail.length == 1 && oldPortsAvail[0] != "" && portsAvail[0] == ""))))
          {
            var ports = Object();
            $("#cb_cf_ports  > option").each(function(index) {
              ports[index] = (this.text);
            });
            var url = "{{  url('CodebenderUtilitiesBundle_logdb', {actionid : 36, meta: 'PLUGIN_META'}) }}";
            url = url.replace("PLUGIN_META", JSON.stringify({ "success": true, "plugin" : true, "version": this.plugin_.version, "ports" : ports}) );
            $.get(url);
          }

          oldPortsAvail = portsAvail;

          if (typeof(this.plugin_.getPorts) !== "undefined")
          {
            this.plugin_.getPorts(function (serialPortsAvail) {
	      if (oldSerialPortsAvail != serialPortsAvail)
	      {
	        var parsedList = $.parseJSON(serialPortsAvail);
	        var ports = "";
	        $.each(parsedList, function (index, elem){
		  ports += elem['port'] + ',';
	        });

                var url = "{{  url('CodebenderUtilitiesBundle_logdb', {actionid : 36, meta: 'PLUGIN_META'}) }}";
                url = url.replace("PLUGIN_META", JSON.stringify({ "success": true, "plugin" : true, "version": this.plugin_.version, "tabID": pl.tabID, "serialLibPorts" : ports, "probeUSBports" : this.plugin_.probeUSB()}) );
	        $.get(url);
	        var url = "{{  url('CodebenderUtilitiesBundle_logdb', {actionid : 74, meta: 'PLUGIN_META'}) }}";
	        url = url.replace("PLUGIN_META", JSON.stringify({ "success": true, "plugin" : true, "version": this.plugin_.version, "tabID": pl.tabID, "jsonPorts" : parsedList}) );
	        $.get(url);
	      }

	      oldSerialPortsAvail = serialPortsAvail;
            });
	  }
        }
      }
      catch(err)
      {
        url = "{{  url('CodebenderUtilitiesBundle_logdb', {actionid : 27 , meta: 'PLUGIN_META'}) }}";
        url = url.replace("PLUGIN_META", JSON.stringify({ "success" : false, "error" : err }) );
        $.get(url);
      }
    }, 500);
  },

  canBurnBootloader: function(programmer) {
    if (typeof this.portslist.options[this.portslist.selectedIndex] === 'undefined' && programmer['communication'] == 'serial') {
      return false;
    }
    else
      return true;

  },

  doflash: function(select, board, programmer, binary, flash_callback) {
    if (select == true && typeof board["upload"]["protocol"] !== 'undefined')
    {
      if(typeof this.portslist. options[this.portslist.selectedIndex] === 'undefined')
      {
        this.owner.eventManager.fire('flash_failed', "Could not connect to selected port. Make sure your board is properly connected.");
        this.owner.setOperationOutput("Could not connect to selected port. Make sure your board is properly connected.");

      }
      else
      {
        if (this.comparePluginVersions(this.parseVersionString(this.plugin_.version), this.parseVersionString("1.6.0.4")) >= 0)
        {
          var disable_flushing = ((typeof board["upload"]["disable_flushing"] === 'undefined') ? "" : board["upload"]["disable_flushing"]);
          this.plugin_.flash(this.portslist. options[this.portslist.selectedIndex].text,
			     binary,
			     board["upload"]["maximum_size"],
			     board["upload"]["protocol"],
			     disable_flushing,
			     board["upload"]["speed"],
			     board["build"]["mcu"],
			     flash_callback);
        }
        else
        {
          this.plugin_.flash(this.portslist.options[this.portslist.selectedIndex].text,
			     binary,
			     board["upload"]["maximum_size"],
			     board["upload"]["protocol"],
			     disable_flushing,
			     board["upload"]["speed"],
			     board["build"]["mcu"],
			     flash_callback);
        }
      }
    }else
    {
      if(typeof programmer == "undefined")
      {
        this.owner.setOperationOutput("The selected device needs a programmer, and none was selected. Operation Aborted.");
        this.owner.eventManager.fire('flash_failed', "Could not connect to selected port. Make sure your board is properly connected.");

      }
      else
      {
        var selectedPort = (typeof this.portslist.options[this.portslist.selectedIndex] === 'undefined') ? '' : this.portslist.options[this.portslist.selectedIndex].text;
        this.plugin_.flashWithProgrammer(selectedPort, binary, board["upload"]["maximum_size"], programmer["protocol"], programmer["communication"], programmer["speed"], programmer["force"], programmer["delay"], board["build"]["mcu"],
					 flash_callback);
      }
    }
  },

  canflash: function(board, programmer, useProgrammer) {

    useProgrammer = useProgrammer || false;
    if (($("#cb_cf_ports").val() != null && $("#cb_cf_ports").val() != "") || (($("#cb_cf_ports").val() == null || $("#cb_cf_ports").val() == "") && typeof board["upload"]["protocol"] === 'undefined') || useProgrammer) {

      if (typeof this.portslist.options[this.portslist.selectedIndex] === 'undefined' && programmer["communication"] == "serial" && (typeof board["upload"]["protocol"] === 'undefined' || useProgrammer))
      {

        return false;
      }

      return true;
    }
    else {
      return false;
    }
  },

  browserSpecificPluginInstall: function(alert)
  {

    var location;
    if (typeof window.location.origin === undefined)
      location = window.location;
    else
      location = window.location.origin;

    if(location.indexOf("codebender.cc") == -1)
    {
      alert+= '<a target="_blank" href = "{{ url("CodebenderStaticBundle_plugin") }}" >Learn more.</a>';
    }
    else
    {
      if(Browsers.isBrowser("Chrome") || Browsers.isBrowser("Chromium"))
      {
	if(Browsers.isOs('Windows','>=','6.2'))
	  alert+= "<a onclick=\'compilerflasher.pluginHandler.addTo('Windows', '{{ '//' ~ app.request.host ~ asset('Codebendercc.msi') }}')\' id='msi-download-url' href = 'javascript:void(0);' >Add to Windows.</a>";
	else
	  alert += "<a onclick='compilerflasher.pluginHandler.addTo(\"Chrome\")' href='https://chrome.google.com/webstore/detail/codebendercc-extension/fkjidelplakiboijmadcpcbpboihkmee' target='_blank'>Add to Chrome</a>";

      }
      else if(Browsers.isBrowser("Firefox"))
      {
	alert+= "<a onclick=\'compilerflasher.pluginHandler.addTo('Firefox', '{{ '//' ~ app.request.host ~ asset('codebender.xpi') }}')\' id='xpi-download-url' href = 'javascript:void(0);' >Add to Firefox.</a>";
      }
    }

    return alert;
  },

  addTo: function(where, pluginUrl)
  {
    url = "{{  url('CodebenderUtilitiesBundle_logdb', {actionid : 45 , meta: 'ADD_TO_META'}) }}";
    url = url.replace("ADD_TO_META", JSON.stringify({ "where": where} ));
    if (typeof (pluginUrl) === 'undefined')
      $.get(url);
    else
    {
      $.get(url).done(function(){
        window.location.replace(pluginUrl);
      });
    }
  },


  enableUSB: function()
  {

    this.connected = false;

    this.serialMonitorVal = '';
    this.serialMonitorToAppend = '';

    this.portslist = $("#cb_cf_ports")[0];
    this.oldPorts = "";

    var pl = this;
    setTimeout(function ()
	       {
                 pl.scan();
	       }, 200);


    setTimeout(function ()
	       {
                 pl.loadPort();
	       }, 500);
  },

  getFire: function() {
    this.plugin_.getPorts(function (ports) {
      // Just in case it is not initialized
      this.portslist = $('#cb_cf_ports')[0];

      // To keep track of wether we need to update the ports
      var portsStr = ports.map(function (p) {return p.port;}).sort().join(',');

      if (portsStr != this.oldPorts) {
        $('#cb_cf_ports').find('option').remove();
        var portsAvail = portsStr.split(",");

        for (var i = 0; i < portsAvail.length; i++) {
          if (portsAvail[i] != "") {
            this.portslist.options[i] = new Option(portsAvail[i],
                                                   portsAvail[i],
                                                   true, false);
          }
        }

        if(this.loaded_port != null)
          this.savePort(this.loaded_port);
        this.oldPorts = portsStr;
        this.loadPort();
      }
    }.bind(this));
  },


  scan: function() {

    /*{#var pl = this;#}*/
    window.hasPerm = this.plugin_.setCallback(function (from, output) {
      if (output == "disconnect") {

        this.owner.pluginHandler.disconnect(true);
      } else
      {
        this.owner.eventManager.fire("plugin_notification", output);
        this.owner.setOperationOutput(output);
      }
    });

    if (!window.hasPerm) {
      this.owner.setOperationOutput("You need to grant permissions to the Codebender extension.");
      this.owner.eventManager.fire('plugin_notification', "You need to grant permissions to the Codebender extension.");
    }


    this.getFire();
    setInterval(this.getFire.bind(this), 5000);
  },

  show_alert: function(message, divname) {
    alertElement = "<div id='";
    alertElement += divname;
    alertElement += "' class='alert'>";
    //        alertElement += "<button type='button' class='close' data-dismiss='alert'>x</button>";
    alertElement += message
    alertElement += "</div>";
    $("#cb_cf_ports_div .alert").hide(100).remove();
    $("#cb_cf_ports_div").prepend(alertElement);
  },

  /*
   Serial Monitor functions
   */
  connect: function() {
    speed = $("#cb_cf_baud_rates option:selected").val() || 9600;
    if (this.connected == false) {
      var url = "{{  url('CodebenderUtilitiesBundle_logdb', {actionid : 18, meta: 'SERIAL_MONITOR_META'}) }}";
      url = url.replace("SERIAL_MONITOR_META", JSON.stringify({ "baudrate" : speed, "port": $("#cb_cf_ports").val(), "tabID": this.tabID }) );
      $.get(url);
      if ($("#cb_cf_ports").val() != null && $("#cb_cf_ports").val() != "") {

        $("#serial_monitor_content").show(1000);
        this.connected = true;
        var pl = this;
        $("#cb_cf_serial_monitor_connect").html("Disconnect").unbind('click').click(function(){pl.disconnect()});
        $("#serial_hud").html("");
        if (this.comparePluginVersions(this.parseVersionString(this.plugin_.version), this.parseVersionString('1.6.0.5')) < 0)
        {
          this.plugin_.serialRead(
	    this.portslist.options[this.portslist.selectedIndex].text,
	    speed,
	    function (from, line) {
              pl.serialHudAppend(line);
	    }
          );
        }
        else
        {
          var pl = this;
	  var port = this.portslist.options[this.portslist.selectedIndex].text;
          this.plugin_.serialRead(
	    this.portslist.options[this.portslist.selectedIndex].text,
	    speed,
	    function (from, line) {
              pl.serialHudAppendString(line);
	    },
	    function (from, line){
              var url = "{{  url('CodebenderUtilitiesBundle_logdb', {actionid : 69 , meta: 'PLUGIN_SERIAL_MONITOR_RETVAL_META'}) }}";
              url = url.replace("PLUGIN_SERIAL_MONITOR_RETVAL_META", JSON.stringify({ "retVal" : line , "version": (window.plugin_version === 'undefined' || window.plugin_version === null) ? "undefined" : window.plugin_version,
										      "url":  window.location.pathname,
										      "OS": { "name": (typeof Browsers.os.name === 'undefined') ? 'undefined' : Browsers.os.name,
											      "version": (Browsers.os.version == null || typeof Browsers.os.version.original === 'undefined') ? 'undefined' : Browsers.os.version.original }, "Browser": { "name": (typeof Browsers.browser.name === 'undefined') ? 'undefined' : Browsers.browser.name,
																															   "version": (typeof Browsers.browser.version === 'undefined' || Browsers.browser.version == null) ? 'undefined' : Browsers.browser.version.original}}));
              $.get(url);
              var msg = this.owner.getFlashFailMessage(line);
              this.owner.setOperationOutput(msg);
              this.owner.eventManager.fire("plugin_notification", msg);
	    }
          );

          this.serialMonitorToAppend = '';
          this.serialMonitorVal = '';
          $("#serial_hud").html(this.serialMonitorVal);
          pl = this;

          window.serialMonitorUpdater = setInterval(function(){
	    if(pl.serialMonitorToAppend != '')
	    {
              var total_length =  pl.serialMonitorToAppend.length + pl.serialMonitorVal.length;
              if(total_length > pl.max_monitor_length)
              {
                pl.serialMonitorVal = pl.serialMonitorVal.substring(total_length - pl.max_monitor_length) + pl.serialMonitorToAppend;
                $("#serial_hud").html(pl.serialMonitorVal);
              }
              else
              {
                pl.serialMonitorVal = pl.serialMonitorVal + pl.serialMonitorToAppend;
                $("#serial_hud").append(pl.serialMonitorToAppend);
              }

              pl.serialMonitorToAppend = '';

              if($('#autoscroll_check').is(':checked'))
                $("#serial_hud").scrollTo(99999999);
	    }
          }, 50);

	  if(typeof this.plugin_.availablePorts !== 'undefined')
	  {
	    var ph = this;
	    window.portValidatorInterval = setInterval(function () {
	      ph.plugin_.availablePorts(function (ports) {
		if (ports.indexOf(port) == -1){
		  clearInterval(window.portValidatorInterval);
		  ph.disconnect(false);
		};
	      });
	    }, 100);
	  }
        }

      }
      else {
        this.owner.setOperationOutput("Please select a valid port!!");
        this.owner.eventManager.fire('plugin_notification', "Please select a valid port!!");
      }
    } else {
      this.disconnect();
    }
  },


  disconnect: function(notified) {
    notified = notified || false;
    if (this.connected == true) {
      if(notified == false)
      {
        var url = "{{  url('CodebenderUtilitiesBundle_logdb', {actionid : 59, meta: 'SERIAL_MONITOR_DISC_META'}) }}";
        url = url.replace("SERIAL_MONITOR_DISC_META",
			  JSON.stringify({
			    "baudrate" : $("#cb_cf_baud_rates option:selected").val(),
			    "port": $("#cb_cf_ports").val(),
			    "tabID": this.tabID
			  }));
        $.get(url);
      }

      if(typeof this.plugin_.availablePorts !== 'undefined')
	clearInterval(window.portValidatorInterval);

      var pl = this;
      $("#cb_cf_serial_monitor_connect").html("<i class='icon-list-alt'></i> Open Serial Monitor").unbind('click').click(function(){pl.connect()});
      this.connected = false;

      $("#cb_cf_serial_monitor_connect").attr('disabled', 'disabled');
      setTimeout(function () {
        $("#cb_cf_serial_monitor_connect").removeAttr('disabled');
      }, 3000);

      $("#serial_monitor_content").hide(1000);


      if (this.comparePluginVersions(this.parseVersionString(this.plugin_.version), this.parseVersionString('1.6.0.5')) >= 0)
      {
        clearInterval(window.serialMonitorUpdater);
        if(!notified)
        {
          this.plugin_.serialMonitorSetStatus();
        }
      }
      else
        this.plugin_.disconnect();
    }
  },

  serialHudAppendString: function(msg)
  {
    if (msg.indexOf("\r\n") !== -1)
      msg = msg.replace("\r\n", "\n");
    if (msg.indexOf("\r") !== -1)
      msg = msg.replace("\r", "");
    var total_length =  this.serialMonitorToAppend.length + msg.length;
    if(total_length > this.max_monitor_length)
    {
      this.serialMonitorToAppend = this.serialMonitorToAppend.substring(total_length - this.max_monitor_length) + msg;
    }
    else
    {
      this.serialMonitorToAppend = this.serialMonitorToAppend + msg;
    }
  },

  serialHudAppend: function(line) {
    if (isNaN(line)) {
      this.serialHudWrite($("#serial_hud").html() + line + "<br>");
    } else {
      if (line == "13")    return;
      if (line == "10")    this.serialHudWrite($("#serial_hud").html() + "<br>");
      if (line != "10")    this.serialHudWrite($("#serial_hud").html() + String.fromCharCode(line));
    }
  },

  serialHudWrite: function(message) {
    if( $("#serial_hud").find('br').length > 500)
      $("#serial_hud").html(message.substring(message.indexOf('<br>') + 4));
    else if (  $("#serial_hud").html().length > this.max_monitor_length )
      $("#serial_hud").html(message.substring($("#serial_hud").html().length - this.max_monitor_length));
    else
      $("#serial_hud").html(message);
    if($('#autoscroll_check').is(':checked'))
      $("#serial_hud").scrollTo(99999999);
  },

  serialSendOnEnter: function(event){
    var e = event || window.event;   // resolve event instance
    if (e.keyCode == '13'){
      this.serialSend();
    }else if (e.keyCode == '10'){
      this.serialSend();
    }
  },

  serialSend: function() {
    this.plugin_.serialWrite($("#text2send").val());
  },

  plugin_error_logger: function(from, msg, status){
    if(typeof status == 'undefined' || status == 0)
    {
      var url = "{{  url('CodebenderUtilitiesBundle_logdb', {actionid : 34 , meta: 'PLUGIN_ERROR_META'}) }}";
      url = url.replace("PLUGIN_ERROR_META", JSON.stringify({ "message" : msg , "version": (window.plugin_version === 'undefined' || window.plugin_version === null) ? "undefined" : window.plugin_version,
							      "url":  window.location.pathname,
							      "OS": { "name": (typeof Browsers.os.name === 'undefined') ? 'undefined' : Browsers.os.name,
								      "version": (Browsers.os.version == null || typeof Browsers.os.version.original === 'undefined') ? 'undefined' : Browsers.os.version.original }, "Browser": { "name": (typeof Browsers.browser.name === 'undefined') ? 'undefined' : Browsers.browser.name,
																												   "version": (typeof Browsers.browser.version === 'undefined' || Browsers.browser.version == null) ? 'undefined' : Browsers.browser.version.original}}));
      $.get(url);
    }
    else if(status ==1)
    {
      var url = "{{  url('CodebenderUtilitiesBundle_logdb', {actionid : 55 , meta: 'PLUGIN_WARNING_META'}) }}";
      url = url.replace("PLUGIN_WARNING_META", JSON.stringify({ "message" : msg , "version": (window.plugin_version === 'undefined' || window.plugin_version === null) ? "undefined" : window.plugin_version,
								"url":  window.location.pathname,
								"OS": { "name": (typeof Browsers.os.name === 'undefined') ? 'undefined' : Browsers.os.name,
									"version": (Browsers.os.version == null || typeof Browsers.os.version.original === 'undefined') ? 'undefined' : Browsers.os.version.original }, "Browser": { "name": (typeof Browsers.browser.name === 'undefined') ? 'undefined' : Browsers.browser.name,
																												     "version": (typeof Browsers.browser.version === 'undefined' || Browsers.browser.version == null) ? 'undefined' : Browsers.browser.version.original}}));
      $.get(url);
    }

  }
}

compilerflasher = function(lf) {

  this.boards_list  = [];
  this.programmers_list = [];
  this.selectedBoard = '';
  this.selectedProgrammer = '';
  this.load_files = lf;
  this.loaded_elements = [];

  this.minVersion = "1.6.0.1";

  this.eventManager = new EventManager();

  // Show the output to the user
  this.setOperationOutput = function(message){
    $("#cb_cf_operation_output").html(message);
  }

  // Synonymous to addListener
  this.on = function(type, listener){
    this.eventManager.addListener(type, listener);
  }


  this.pluginHandler = new PluginHandler(this);

  var cb = this;
  if($("#cb_cf_operation_output").length > 0)
  {
    this.loaded_elements.push("cb_cf_operation_output");
  }
  if($("button#cb_cf_verify_btn").length > 0)
  {
    $("#cb_cf_verify_btn").click(function(){cb.verify()});
    this.loaded_elements.push("cb_cf_verify_btn");
  }
  if($("select#cb_cf_boards").length > 0)
  {
    $("#cb_cf_boards").append($('<option></option>').html("Loading Boards..."))
      .attr('disabled', 'disabled')
      .click(function(){cb.clickedBoard()})
      .change(function(){cb.saveBoard()});
    $.getJSON("{{ url('CodebenderBoardBundle_listboards') }}", function(data){boardsListCallback(data)});
    this.loaded_elements.push("cb_cf_boards");
  }
  if($("select#cb_cf_ports").length > 0)
  {
    $("#cb_cf_ports").click(function(){cb.pluginHandler.clickedPort()})
      .change(function(){cb.pluginHandler.savePort()})
      .attr("disabled", "disabled");

    if($("#cb_cf_ports").data().pluginVersion)
      this.pluginHandler.minVersion = $("#cb_cf_ports").data().pluginVersion;

    this.loaded_elements.push("cb_cf_ports");
  }
  if($("button#cb_cf_flash_btn").length > 0)
  {
    $("#cb_cf_flash_btn")
      .click(function(){cb.usbflash()})
      .attr("disabled", "disabled");;
    this.loaded_elements.push("cb_cf_flash_btn");
  }
  if($("select#cb_cf_programmers").length > 0)
  {
    $("#cb_cf_programmers").append($('<option></option>').html("Loading Programmers..."))
      .attr('disabled', 'disabled')
      .click(function(){cb.clickedProgrammer()})
      .change(function(){cb.saveProgrammer()});
    $.getJSON("{{ url('CodebenderBoardBundle_listprogrammers') }}", function (data)
	      {
		programmersListCallback(data)
	      });
    this.loaded_elements.push("cb_cf_programmers");
  }
  if($("button#cb_cf_flash_with_prog_btn").length > 0)
  {
    $("#cb_cf_flash_with_prog_btn").click(function(){cb.usbflashWithProgrammer()})
      .attr('disabled', 'disabled');
    this.loaded_elements.push("cb_cf_flash_with_prog_btn");
  }
  if($("select#cb_cf_baud_rates").length > 0)
  {
    $("#cb_cf_baud_rates").append(
      "<option>9600</option>" +
        "<option>19200</option>" +
        "<option>28800</option>" +
        "<option>38400</option>" +
        "<option>57600</option>" +
        "<option>115200</option>")
      .attr('disabled', 'disabled');

    this.loaded_elements.push("cb_cf_baud_rates");
  }
  if($("button#cb_cf_serial_monitor_connect").length > 0)
  {

    $("#cb_cf_serial_monitor_connect").click(function(){cb.pluginHandler.connect()})
      .attr('disabled', 'disabled');
    this.loaded_elements.push("cb_cf_serial_monitor_connect");
  }
  if($("#cb_cf_serial_monitor").length > 0)
  {
    $("#cb_cf_serial_monitor").html("{% filter escape('js') %}{% include 'CodebenderGenericBundle:CompilerFlasher:serialmonitor_section.html.twig' %}{% endfilter %}");
    this.loaded_elements.push("cb_cf_serial_monitor");
  }
  if($("#cb_cf_burn_bootloader").length > 0)
  {
    $("#cb_cf_burn_bootloader").click(function(){cb.burn_bootloader();})
      .attr('disabled', 'disabled');
    this.loaded_elements.push("cb_cf_burn_bootloader");
  }

  if(window.location.origin.indexOf("codebender.cc") == -1)
  {
    this.pluginHandler.initializePlugin();
  }
  else
  {
    window.osBrowserDetectionValidInterval = setInterval(function(){
      if(typeof window.osBrowserIsSupported !== 'undefined')
      {
        clearInterval(window.osBrowserDetectionValidInterval);
        cb.pluginHandler.initializePlugin();
      }
    }, 100);

  }

  this.saveBoard = function() {

    if(typeof Lawnchair !== 'undefined')
    {
      new Lawnchair(function () {
        cb.save({key:'board', name:$("#cb_cf_boards option:selected").text()});
      });
    }

    var oldBoard = cb.selectedBoard.name;

    cb.selectedBoard = cb.boards_list[$("#cb_cf_boards").prop("selectedIndex")];

    var newBoard = cb.selectedBoard.name;
    url = "{{  url('CodebenderUtilitiesBundle_logdb', {actionid : 37 , meta: 'SAVEBOARDMETA'}) }}";
    url = url.replace("SAVEBOARDMETA", JSON.stringify({ "oldBoard":oldBoard, "newBoard":newBoard, "tabID": cb.pluginHandler.tabID } ));
    $.get(url);
  };

  this.loadBoard = function() {
    var cb = this;
    if(typeof Lawnchair !== 'undefined')
    {
      Lawnchair(function () {
        cb.exists('board', function (exists) {
          if (exists) {
            cb.get('board', function (config) {
	      $("#cb_cf_boards").val(config.name)
            })
          }

          cb.selectedBoard = cb.boards_list[$("#cb_cf_boards").prop("selectedIndex")];
        });
      });
    }
    else
    {
      cb.selectedBoard = cb.boards_list[$("#cb_cf_boards").prop("selectedIndex")];
    }
  };

  this.getMaxSize = function() {
    return parseInt(cb.selectedBoard["upload"]["maximum_size"]);
  }


  this.saveProgrammer = function() {
    if(typeof Lawnchair !== 'undefined')
    {
      new Lawnchair(function () {
        cb.save({key:'programmer', name:$("#cb_cf_programmers option:selected").text()});
      });
    }

    var oldProgrammer = cb.selectedProgrammer.name;

    cb.selectedProgrammer = cb.programmers_list[$("#cb_cf_programmers").prop("selectedIndex")];

    var newProgrammer = cb.selectedProgrammer.name;
    url = "{{  url('CodebenderUtilitiesBundle_logdb', {actionid : 39 , meta: 'SAVEPROGRAMMERMETA'}) }}";
    url = url.replace("SAVEPROGRAMMERMETA", JSON.stringify({ "oldProgrammer":oldProgrammer, "newProgrammer":newProgrammer, "tabID": cb.pluginHandler.tabID } ));
    $.get(url);

  };

  this.loadProgrammer = function() {
    window.programmersInitInterv = setInterval(function(){

      if(cb.pluginHandler.plugin_running)
      {
        clearInterval(window.programmersInitInterv);

        if(typeof Lawnchair !== 'undefined')
        {
          Lawnchair(function () {
            this.exists('programmer', function (exists) {
	      if (exists) {
                this.get('programmer', function (config) {
                  $("#cb_cf_programmers").val(config.name)
                })
	      }
	      cb.selectedProgrammer = cb.programmers_list[$("#cb_cf_programmers").prop("selectedIndex")];
            });
          });
        }
        else
        {
          cb.selectedProgrammer = cb.programmers_list[$("#cb_cf_programmers").prop("selectedIndex")];
        }
      }
    }, 60);
  };


  this.getDefaultBoard = function (){
    var SearchString = window.location.search.substring(1);
    var VariableArray = SearchString.split('&');
    for(var i = 0; i < VariableArray.length; i++){
      var KeyValuePair = VariableArray[i].split('=');
      if(KeyValuePair[0] == 'board'){
        return decodeURIComponent(KeyValuePair[1]);
      }
    }
  };

  this.setBoardsList = function(data){
    cb.boards_list = data;
  };

  this.getBoardsList = function(){
    return cb.boards_list ;
  }

  this.clickedBoard = function()
  {
    var board = $("#cb_cf_boards option:selected").text();
    url = "{{  url('CodebenderUtilitiesBundle_logdb', {actionid : 42 , meta: 'CLICK_BOARD_META'}) }}";
    url = url.replace("CLICK_BOARD_META", JSON.stringify({ "selectedBoard": board, "tabID": cb.pluginHandler.tabID} ));
    $.get(url);
  }

  this.clickedProgrammer = function()
  {
    var programmer = $("#cb_cf_programmers option:selected").text();
    url = "{{  url('CodebenderUtilitiesBundle_logdb', {actionid : 44 , meta: 'CLICK_PROGRAMMER_META'}) }}";
    url = url.replace("CLICK_PROGRAMMER_META", JSON.stringify({ "selectedProgrammer": programmer, "tabID": cb.pluginHandler.tabID} ));
    $.get(url);
  }

  this.generate_payload =  function(format, logging) {
    logging = (typeof logging === "undefined") ? false : logging;
    var files = cb.load_files();

    var count = 0;
    var files_array = Array();
    jQuery.each(files, function (i, val) {
      /* We have to append a newline in every file, in order
       * to follow closely the behavior of the original Arduino IDE and
       * keep the clang auto-completer happy! */
      files_array[count++] = {"filename":i, "content":$("<div/>").html(val).text() + '\n'};
    });

    if(logging)
      var payload = {"files":files_array, "logging":logging, "format":format, "version":"105", "build": cb.selectedBoard["build"]};
    else
      var payload = {"files":files_array, "format":format, "version":"105", "build": cb.selectedBoard["build"]};

    if(format == 'autocomplete' && typeof editor !== 'undefined')
    {

      payload['position'] = editor.getSession().getSelection().selectionLead.getPosition();
      payload['position']['file'] = editor.selectedFile;
      payload['archive'] = true;
    }

    return JSON.stringify(payload)
  }

  this.getFlashFailMessage = function(error){
    var msg = '';
    if (window.flashing_errors[error])
      msg = window.flashing_errors[error] + " <a href='https://codebender.uservoice.com/knowledgebase/articles/183395-usb-flashing-known-errors' target='_blank'>More Info</a>";
    else
      msg = "An error occured while connecting to your device. Please try again.";

    return msg
  }


  this.flash_callback = function(from, progress) {

    if (progress)
    {
      msg = cb.getFlashFailMessage(progress);
      cb.setOperationOutput(msg);
      cb.eventManager.fire('flash_failed', msg);


    } else
    {
      cb.eventManager.fire('flash_succeed');
      cb.setOperationOutput("Upload successful!");
    }


    var url = "{{ url('CodebenderUtilitiesBundle_flash', {error: 'ERROR_CODE'}) }}";
    url = url.replace('ERROR_CODE', progress);
    $.get(url);
  }


  this.getHex = function() {

    cb.eventManager.fire('pre_hex');
    var payload = cb.generate_payload("hex");
    $.post("{{ url('CodebenderUtilitiesBundle_compile')}}", payload, function (data) {
      try{
        var obj = jQuery.parseJSON(data);
        if (obj.success == 0) {
          cb.setOperationOutput("Verification failed.");
          cb.eventManager.fire('hex_failed', obj.message);
        }
        else
        {
          cb.setOperationOutput("Verification Successful!")
          cb.eventManager.fire('hex_succeed', obj);
        }

      }
      catch(err){
        cb.eventManager.fire('hex_failed', '<i class="icon-remove"></i> Unexpected error occured. Try again later.');
        cb.setOperationOutput('<i class="icon-remove"></i> Unexpected error occured. Try again later.');
      }

    });
  }

  this.usbflash = function()
  {

    url = "{{  url('CodebenderUtilitiesBundle_logdb', {actionid : 40 , meta: 'RUN_BUTTON_META'}) }}";
    url = url.replace("RUN_BUTTON_META", JSON.stringify({ "port":$("#cb_cf_ports option:selected").text(), "board":$("#cb_cf_boards option:selected").text(), "programmer":$("#cb_cf_programmers option:selected").text(), "tabID": cb.pluginHandler.tabID } ));
    $.get(url);

    if(cb.pluginHandler.canflash(cb.selectedBoard, cb.selectedProgrammer))
    {
      cb.eventManager.fire('pre_flash');
      cb.setOperationOutput("<i class='icon-spinner icon-spin'> </i> Working...");
      cb.getbin(function(obj){
        if (obj.success == 0) {
          cb.setOperationOutput("There was an error compiling.")
          cb.eventManager.fire('verification_failed', obj.message);
        }
        else
        {
          cb.eventManager.fire('mid_flash', obj.size);

          if (parseInt(obj.size) > cb.getMaxSize())
          {
            cb.setOperationOutput("There is not enough space!");
            cb.eventManager.fire('flash_failed', "There is not enough space!");
          }
          else
          {
            if (cb.pluginHandler.connected == true)
            {
	      cb.pluginHandler.disconnect(false);
	      setTimeout(function(){
                cb.pluginHandler.doflash(true, cb.selectedBoard, cb.selectedProgrammer, obj['output'], cb.flash_callback);
	      }, 200);
            } else {
	      cb.pluginHandler.doflash(true, cb.selectedBoard, cb.selectedProgrammer, obj['output'], cb.flash_callback);
            }
          }
        }
      })
    }
    else
    {
      cb.setOperationOutput("Please select a valid port!");
      cb.eventManager.fire("plugin_notification", "Please select a valid port!!");
    }

  }


  this.usbflashWithProgrammer = function()
  {
    url = "{{  url('CodebenderUtilitiesBundle_logdb', {actionid : 41 , meta: 'RUN_WITH_PROG_BUTTON_META'}) }}";
    url = url.replace("RUN_WITH_PROG_BUTTON_META", JSON.stringify({ "port":$("#cb_cf_ports option:selected").text(), "board":$("#cb_cf_boards option:selected").text(), "programmer":$("#cb_cf_programmers option:selected").text(), "tabID": cb.pluginHandler.tabID } ));
    $.get(url);

    if(cb.pluginHandler.canflash(cb.selectedBoard, cb.selectedProgrammer, true))
    {
      cb.eventManager.fire('pre_flash');
      cb.setOperationOutput("<i class='icon-spinner icon-spin'> </i> Working...");
      cb.getbin(function(obj){
        if (obj.success == 0) {
          cb.setOperationOutput("There was an error compiling.")
          cb.eventManager.fire('verification_failed', obj.message);
        }
        else
        {
          cb.eventManager.fire('mid_flash', obj.size);

          if (cb.pluginHandler.connected == true)
          {
            cb.pluginHandler.disconnect(false);
            setTimeout(function(){
	      cb.pluginHandler.doflash(false, cb.selectedBoard, cb.selectedProgrammer, obj['output'], cb.flash_callback);
            }, 200);
          } else {
            cb.pluginHandler.doflash(false, cb.selectedBoard, cb.selectedProgrammer, obj['output'], cb.flash_callback);
          }
        }
      })
    }
    else
    {
      cb.setOperationOutput("Please select a valid port for the programmer!");
      cb.eventManager.fire('plugin_notification', "Please select a valid port for the programmer!");
    }
  }

  this.getbin = function(callback) {
    var payload = cb.generate_payload("binary");
    $.post("{{ url('CodebenderUtilitiesBundle_compile')}}", payload, function (data) {
      try{
        var obj = jQuery.parseJSON(data);
        callback(obj);
      }
      catch(err){
        cb.setOperationOutput('<i class="icon-remove"></i> Unexpected error occurred. Try again later.');
        cb.eventManager.fire('verification_failed', '<i class="icon-remove"></i> Unexpected error occurred. Try again later.');
      }
    })
      .fail(function() {
        cb.setOperationOutput("Connection to server failed.");
        cb.eventManager.fire('verification_failed', "Connection to server failed.");
      });
  }

  this.verify =  function() {

    var board = $("#cb_cf_boards option:selected").text();
    url = "{{  url('CodebenderUtilitiesBundle_logdb', {actionid : 47 , meta: 'VERIFY_META'}) }}";
    url = url.replace("VERIFY_META", JSON.stringify({ "selectedBoard": board, "tabID": cb.pluginHandler.tabID} ));
    $.get(url);

    cb.eventManager.fire('pre_verify');
    cb.setOperationOutput("<i class='icon-spinner icon-spin'> </i> Working...");
    cb.getbin(function(obj){
      if (obj.success == 0) {
        cb.setOperationOutput("Verification failed.");
        cb.eventManager.fire('verification_failed', obj.message);
      }
      else
      {
        cb.setOperationOutput("Verification Successful");
        cb.eventManager.fire('verification_succeed', obj.size);
      }
    });

  }

  /*{# this.setOperationOutput = function(message){
   $("#cb_cf_operation_output").html(message);
   } #}*/

  this.burn_bootloader = function() {
    /*{#$("#start_button").prop('disabled', true);#}*/


    if(cb.pluginHandler.canBurnBootloader(cb.selectedProgrammer))
    {
      var url = "{{  url('CodebenderUtilitiesBundle_logdb', {actionid : 25, meta: 'UPLOAD_BOOTLOADER_META'}) }}";
      url = url.replace("UPLOAD_BOOTLOADER_META", JSON.stringify({ "programmer" : $('#programmer option:selected').val(),
								   "board" : $('#cb_cf_boards option:selected').val(), "port" : $('#cb_cf_ports option:selected').val(),
								   "bootloader_file" : ((typeof this.selectedBoard['bootloader']['file']) === "undefined") ? "undefined" : this.selectedBoard['bootloader']['file'] }) );
      $.get(url);

      this.setOperationOutput("<i class='icon-spinner icon-spin'></i> Working...")
      if (typeof this.selectedBoard['bootloader']['file'] === "undefined")
      {
        this.plugin_.saveToHex("");
        window.result = this.pluginHandler.doflashBootloader(this.selectedProgrammer, this.selectedBoard);
      }
      else
      {
        var cb = this;
        $.get('{{ asset("bootloader/") }}' + this.selectedBoard['bootloader']['file'].replace(".hex", ".txt"))
          .success(function(data){
            this.plugin_.saveToHex(data);
            window.result = cb.pluginHandler.doflashBootloader(cb.selectedProgrammer, cb.selectedBoard);
          })
          .error(function(){
            /*{#$("#start_button").prop('disabled', false);#}*/
            cb.setOperationOutput("The bootloader file was not found.");
          });

      }
    }
    else
    {
      this.setOperationOutput("Please select a valid port!")
    }

  }


  this.disableCompilerFlasherActions = function(){
    $("#cb_cf_boards").attr("disabled", "disabled");
    $("#cb_cf_verify_btn").attr("disabled", "disabled");
    if(cb.pluginHandler.plugin_running)
    {
      $("#cb_cf_ports").attr("disabled", "disabled");
      $("#cb_cf_flash_btn").attr("disabled", "disabled");
      $("#cb_cf_programmers").attr("disabled", "disabled");
      $("#cb_cf_flash_with_prog_btn").attr("disabled", "disabled");
      $("#cb_cf_baud_rates").attr("disabled", "disabled");
      $("#cb_cf_serial_monitor_connect").attr("disabled", "disabled");
    }

  }

  this.enableCompilerFlasherActions = function(){
    $("#cb_cf_boards").removeAttr("disabled");
    $("#cb_cf_verify_btn").removeAttr("disabled");
    if(cb.pluginHandler.plugin_running)
    {
      $("#cb_cf_ports").removeAttr("disabled");
      $("#cb_cf_flash_btn").removeAttr("disabled");
      $("#cb_cf_programmers").removeAttr("disabled");
      $("#cb_cf_flash_with_prog_btn").removeAttr("disabled");
      $("#cb_cf_baud_rates").removeAttr("disabled");
      $("#cb_cf_serial_monitor_connect").removeAttr("disabled");
    }
  }

  this.on("pre_verify", this.disableCompilerFlasherActions);
  this.on("verification_succeed", this.enableCompilerFlasherActions);
  this.on("verification_failed", this.enableCompilerFlasherActions);
  this.on("pre_flash", this.disableCompilerFlasherActions);
  this.on("flash_failed", this.enableCompilerFlasherActions);
  this.on("flash_succeed", this.enableCompilerFlasherActions);
  this.on("pre_hex", this.disableCompilerFlasherActions);
  this.on("hex_succeed", this.enableCompilerFlasherActions);
  this.on("hex_failed", this.enableCompilerFlasherActions);
};


function boardsListCallback(data) {
  this.setBoardsList(data);

  $('#cb_cf_boards').find('option').remove().end();
  var found = false;
  if ($("#cb_cf_boards").data().board){
    for (var i = 0; i < this.boards_list.length; i++) {
      if (this.boards_list[i]["name"] == $("#cb_cf_boards").data().board)
      {
        this.selectedBoard = this.boards_list[i];
        $('#cb_cf_boards').hide();
        found = true;
      }

    }
  }
  if(!found)
  {
    /*{#$("#cb_cf_boards").html('{% filter escape('js') %}{% include 'CodebenderGenericBundle:CompilerFlasher:boardlist_section.html.twig'%}{% endfilter %}');#}*/
    for (var i = 0; i < this.boards_list.length; i++)
      $("#cb_cf_boards").append($('<option></option>').val(this.boards_list[i]["name"]).html(this.boards_list[i]["name"]));
    this.loadBoard();


    var board = this.getDefaultBoard();
    if(board !== 'undefined' && $("#cb_cf_boards option[value='"+board+"']").length == 1)
    {
      $("#cb_cf_boards").val(board);
      this.saveBoard();
    }

    $('#cb_cf_boards').removeAttr('disabled');
  }
}

function programmersListCallback(data){
  this.programmers_list = data;
  $('#cb_cf_programmers').find('option').remove().end();
  for (var i = 0; i < this.programmers_list.length; i++)
    $("#cb_cf_programmers").append($('<option></option>').val(this.programmers_list[i]["name"]).html(this.programmers_list[i]["name"]));
  this.loadProgrammer();
  /*{#$('#cb_cf_programmers').removeAttr('disabled');#}*/
}

// {% include 'CodebenderGenericBundle:CompilerFlasher:compiler_scripts.js.twig' %}
function logging() {
  var payload = generate_payload("binary", true);
  $.post("{{ path('CodebenderUtilitiesBundle_compile')}}", payload, function(data) {
    var obj = jQuery.parseJSON(data);
  });
}

// {% include 'CodebenderGenericBundle:CompilerFlasher:flasher_scripts.js.twig' %}

window.flashing_errors = {
  1: "Could not connect to your device. Make sure that you have connected it properly, that you have selected the correct settings (device type and port) and try again.",
  256: "Could not connect to your device. Make sure that you have connected it properly, that you have selected the correct settings (device type and port) and try again.",
  259: "Could not program your device, the process timed out. Make sure that you have connected it properly, that you have selected the correct settings (device type and port) and try again.",
  "-1": "Couldn’t find an Arduino on the selected port. If you are using Leonardo check that you have the correct port selected. If it is correct, try pressing the board’s reset button after initiating the upload",
  "-2": "There was a problem programming your Arduino. If you are using a non-English Windows version, or username please contact us.",
  "-204": "Could not program your device, the process timed out. Make sure that you have connected it properly, that you have selected the correct settings (device type and port) and try again.",
  "-22": "The selected port seems to be in use. Please check your board connection, and make sure that you are not using it from some other application, you don't have an open serial monitor.",
  "-23": "Another flashing process is still active. Please wait until it is done and try again.",
  "-55": "The specified port might not be available. Please check if it is used by another application. If the problem persists, unplug your device and plug it again.",
  "-56": "The specified port might not be available. Please check if it is used by another application. If the problem persists, unplug your device and plug it again.",
  "-57": "The specified port might not be available. Please check if it is used by another application. If the problem persists, unplug your device and plug it again.",
  "126": "Something seems to be wrong with the plugin installation. You need to install the plugin again.",
  "127": "Something seems to be wrong with the plugin installation. You need to install the plugin again.",
  "-200": "There was a problem during the flashing process. Please try again, or contact us if the problem persists.",
  100: "Could not connect to your device. Make sure that you have connected it properly, that you have selected the correct settings (device type and port) and try again.",
  32001: "The selected port seems to be in use. Please make sure that you are not using it from some other program.",
  33005: "This baudrate is not supported by the operating system.",
  2001: "The selected port seems to be in use. Please make sure that you are not using it from some other program.",
  3005: "This baudrate is not supported by the operating system."

};
//Scrolling function
(function($) {
  var h = $.scrollTo = function(a, b, c) {
    $(window).scrollTo(a, b, c);
  };
  h.defaults = {
    axis: 'xy',
    duration: parseFloat($.fn.jquery) >= 1.3 ? 0 : 1,
    limit: true
  };
  h.window = function(a) {
    return $(window)._scrollable();
  };
  $.fn._scrollable = function() {
    return this.map(function() {
      var a = this,
          isWin = !a.nodeName || $.inArray(a.nodeName.toLowerCase(), ['iframe', '#document', 'html', 'body']) != -1;
      if (!isWin) return a;
      var b = (a.contentWindow || a).document || a.ownerDocument || a;
      return /webkit/i.test(navigator.userAgent) || b.compatMode == 'BackCompat' ? b.body : b.documentElement;
    });
  };
  $.fn.scrollTo = function(e, f, g) {
    if (typeof f == 'object') {
      g = f;
      f = 0;
    }
    if (typeof g == 'function') g = {
      onAfter: g
    };
    if (e == 'max') e = 9e9;
    g = $.extend({}, h.defaults, g);
    f = f || g.duration;
    g.queue = g.queue && g.axis.length > 1;
    if (g.queue) f /= 2;
    g.offset = both(g.offset);
    g.over = both(g.over);
    return this._scrollable().each(function() {
      if (e == null) return;
      var d = this,
          $elem = $(d),
          targ = e,
          toff, attr = {},
          win = $elem.is('html,body');
      switch (typeof targ) {
      case 'number':
      case 'string':
        if (/^([+-]=)?\d+(\.\d+)?(px|%)?$/.test(targ)) {
          targ = both(targ);
          break
        }
        targ = $(targ, this);
        if (!targ.length) return;
      case 'object':
        if (targ.is || targ.style) toff = (targ = $(targ)).offset()
      }
      $.each(g.axis.split(''), function(i, a) {
        var b = a == 'x' ? 'Left' : 'Top',
            pos = b.toLowerCase(),
            key = 'scroll' + b,
            old = d[key],
            max = h.max(d, a);
        if (toff) {
          attr[key] = toff[pos] + (win ? 0 : old - $elem.offset()[pos]);
          if (g.margin) {
            attr[key] -= parseInt(targ.css('margin' + b)) || 0;
            attr[key] -= parseInt(targ.css('border' + b + 'Width')) || 0;
          }
          attr[key] += g.offset[pos] || 0;
          if (g.over[pos]) attr[key] += targ[a == 'x' ? 'width' : 'height']() * g.over[pos];
        } else {
          var c = targ[pos];
          attr[key] = c.slice && c.slice(-1) == '%' ? parseFloat(c) / 100 * max : c;
        }
        if (g.limit && /^\d+$/.test(attr[key])) attr[key] = attr[key] <= 0 ? 0 : Math.min(attr[key], max);
        if (!i && g.queue) {
          if (old != attr[key]) animate(g.onAfterFirst);
          delete attr[key]
        }
      });
      animate(g.onAfter);

      function animate(a) {
        $elem.animate(attr, f, g.easing, a && function() {
          a.call(this, e, g);
        });
      }
    }).end();
  };

  h.max = function(a, b) {
    var c = b == 'x' ? 'Width' : 'Height',
	scroll = 'scroll' + c;
    if (!$(a).is('html,body')) return a[scroll] - $(a)[c.toLowerCase()]();
    var d = 'client' + c,
	thtml = a.ownerDocument.documentElement,
	body = a.ownerDocument.body;
    return Math.max(html[scroll], body[scroll]) - Math.min(html[d], body[d]);
  };

  function both(a) {
    return typeof a == 'object' ? a : {
      top: a,
      left: a
    }
  }
})(jQuery);
