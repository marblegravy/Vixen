// Vixen.

/*global HTMLVideoElement:true, HTMLAudioElement:true, HTMLElement:true, document:true, module:true, createVixel:true, window:true */

(function(glob) {
	"use strict";
	
	function Vixen(mediaObject,options) {
		
		if (!(mediaObject instanceof HTMLVideoElement ||
				mediaObject instanceof HTMLAudioElement))
					throw new Error("Media input was not a media element.");
		
		this.media = mediaObject;
		this.media.uiController = this;
		this.options = options && options instanceof Object ? options : {};
		this.ui = {};
		
		// For css classes...
		this.namespace = "vixen";
		
		// Check API support for newer features and store functions we discover
		this.fullScreenEnabled = Vixen.unprefix("fullScreenEnabled",document);
		this.requestFullScreen = Vixen.unprefix("requestFullScreen",document.body);
		this.cancelFullScreen = Vixen.unprefix("cancelFullScreen",document);
		
		// Build the UI...
		this.buildUI();
		
		// Attach UI Events...
		this.attachEvents();
		
		// ...and update the UI with information from the media object!
		this.updateUI();
		
		// A bit of state
		this.isfullscreen = false;
		this.playing = false;
		this.readyState = this.media.readyState;
		
		return this;
	}
	
	Vixen.prototype.buildUI = function() {
		var self = this;
		
		// Tiny DSL for element creation.
		var c = createVixel(this), w = c;
		
		// Wrap media element
		w(self.media,"media");
		
		// Build the UI.
		// Create scrubber
		c("div","scrubber")
			.a(c("div","loadprogress"))
			.a(
				c("div","playprogress").a(
					c("div","thumb")));
		
		// Create volume control...
		c("div","volumegroup")
			.a(c("button","mute").t("Mute"))
			.a(c("div","volumeslider")
				.a(
					c("div","volumesliderinner")
						.a(c("div","volumethumb"))));
		
		// Bulk of the UI...
		c("div","container")
			.r("application")
			.a(c("div","mediawrapper"))
			.a(
				c("div","toolbar")
					.r("toolbar")
					.a(c("button","playpause").t("Play"))
					.a(c("label","elapsed"))
					.a(self.ui.scrubber)
					.a(c("label","remaining"))
					.a(self.ui.volumegroup));
		
		// Is the fullscreen API present in the browser?
		// Is this a video (i.e. does fullscreen even make sense?)
		if (self.requestFullScreen &&
			self.media instanceof HTMLVideoElement) {
			
			// Append a fullscreen button
			self.ui.toolbar.a(
				c("button","fullscreen")
					.t("Fullscreen"));
		}
		
		// Provide a class based on whether we're an audio or video player
		if (self.media instanceof HTMLVideoElement) {
			self.ui.container.c("video");
		} else {
			self.ui.container.c("audio");
		}
		
		// Now swap out the media for the container
		c.replace(self.media,self.ui.container);
		
		// And plug in the media...
		self.ui.mediawrapper.a(self.media);
		
		// And switch off the native controls for the media element.
		self.media.removeAttribute("controls");
		
		// Just check whether our sliders are horizontal or vertical...
		// A simple width vs. height check should do.
		self.ui.scrubber.vertical =
			self.ui.scrubber.offsetHeight > self.ui.scrubber.offsetWidth;
		
		self.ui.volumeslider.vertical =
			self.ui.volumeslider.offsetHeight > self.ui.volumeslider.offsetWidth;
		
		// Enable chaining...
		return self;
	};
	
	Vixen.prototype.attachEvents = function() {
		var self = this;
		
		// Button Events
		self.ui.playpause.on("click",self.playpause);
		
		self.ui.mute.on("click",function() {
			if (self.media.volume > 0) {
				self.ui.mute.t("Unmute");
				self.previousVolume = self.media.volume;
				self.volume(0);
			} else {
				self.ui.mute.t("Mute");
				self.volume(self.previousVolume);
			}
		});
		
		if (self.ui.fullscreen) {
			self.ui.fullscreen.on("click",self.fullscreen);
		}
		
		// Handle dragging for volume and scrubbing bar
		self.ui.scrubber.ondrag(function(percentage) {
			var vertical = this.vertical,
				value = vertical ? percentage.y : percentage.x,
				styleprop = vertical ? "height" : "width";
			
			self.ui.playprogress.s(styleprop,(value*100)+"%");
			self.jumpTo(value * self.media.duration);
		});
		
		// And now volume slider. (y) assumes vertical orientation.
		self.ui.volumeslider.ondrag(function(percentage) {
			var vertical = this.vertical,
				value = vertical ? percentage.y : percentage.x,
				styleprop = vertical ? "height" : "width";
			
			self.ui.volumesliderinner.s(styleprop,(value*100)+"%");
			self.volume(value);
		});
		
		// Prevent selection and default actions happening to anything
		// in the toolbar...
		self.ui.toolbar.on("mousedown",function(evt) {
			evt.preventDefault();
		});
		
		// media events to listen to
		[
			"abort",
			"canplay",
			"canplaythrough",
			"click",
			"durationchange",
			"emptied",
			"ended",
			"error",
			"loadeddata",
			"loadedmetadata",
			"loadstart",
			"pause",
			"play",
			"playing",
			"progress",
			"ratechange",
			"seeked",
			"seeking",
			"stalled",
			"suspend",
			"timeupdate",
			"volumechange",
			"waiting" ].forEach(function(evt) {
			
			// Just throw them all out to the catchall...
			self.media.on(evt,self.handleMediaEvent);
		});
		
		// Some themes are going to need a bit of help from JS.
		// Handle window resize...
		window.addEventListener("resize",function() {
			self.updateUI();
		},"false");
		
		return self;
	}
	
	Vixen.prototype.updateUI = function() {
		var	self			= this,
			duration		= self.media.duration || 0,
			currentTime		= self.media.currentTime,
			playPercentage	= (currentTime/duration)*100,
			loadPercentage	= 0,
			loadedTo		= 0;
		
		if (currentTime > duration || !currentTime) currentTime = 0;
		
		// This is a little simplistic, but it works. Get the largest endTime
		// for buffered time ranges.
		for (var range = 0; range < self.media.buffered.length; range ++) {
			if (self.media.buffered.end(range) > loadedTo)
				loadedTo = self.media.buffered.end(range);
				loadPercentage = (loadedTo/duration)*100;
		}
		
		if (!self.ui.scrubber.dragging)
			self.ui.playprogress.s("width",playPercentage+"%");
		
		self.ui.loadprogress.s("width",loadPercentage+"%");
		
		if (!self.ui.volumeslider.dragging)
			self.ui.volumesliderinner.s("height",(self.media.volume*100)+"%");
		
		// Get offset dimension (either width or height, depending on whether
		// the scrubbing bar is oriented horizontally or vertically) of all
		// elements in the toolbar that aren't the scrubber itself...
		var toolbarUIDimension = 0,
			vertical = self.ui.scrubber.vertical,
			toolbar = self.ui.toolbar,
			toolbarRealEstate = 
				vertical ? toolbar.offsetWidth : toolbar.offsetWidth;
		
		[].slice.call(self.ui.toolbar.childNodes).forEach(function(node) {
			if (node instanceof HTMLElement && node !== self.ui.scrubber) {
				toolbarUIDimension +=
					vertical ? node.offsetHeight: node.offsetWidth;
			}
		});
		
		var spaceAvailable = toolbarRealEstate - (toolbarUIDimension*1.1);
		self.ui.scrubber.s(vertical? "height" : "width",spaceAvailable + "px");
		
		self.emit("updateui");
	};
	
	Vixen.prototype.handleMediaEvent = function(eventData) {
		var self = this;
		
		self.updateUI();
		
		/* 
		
		events:
		
		"abort",
		"canplay",
		"canplaythrough",
		"click",
		"durationchange",
		"emptied",
		"ended",
		"error",
		"loadeddata",
		"loadedmetadata",
		"loadstart",
		"pause",
		"play",
		"playing",
		"progress",
		"ratechange",
		"seeked",
		"seeking",
		"stalled",
		"suspend",
		"timeupdate",
		"volumechange",
		"waiting" 
		*/
		
		
		switch (eventData.type) {
			case "click":
				self.playpause();
				break;
			
			case "error":
			
				break;
				
			case "ended":
				
				break;
			
		}
		
		// Media state...
		// buffered
		// currentSrc
		// duration
		// ended
		// error
		// networkState
		// paused
		// played
		// readyState
		// seekable
		// seeking
		// startTime
		
		self.emit(eventData.type);
	};
	
	Vixen.prototype.load = function() {
		
		this.media.load();
	};
	
	Vixen.prototype.playpause = function() {
		// Play if we're paused
		if (this.media.paused)
			return this.play();
		
		// Or pause if we're playing!
		return this.pause();
	};
	
	Vixen.prototype.play = function() {
		this.media.play();
		this.ui.playpause.t("Pause");
		this.ui.container.c("playing");
		this.playing = true;
		
		return this;
	};
	
	Vixen.prototype.pause = function() {
		this.media.pause();
		this.ui.playpause.t("Play");
		this.ui.container.c("playing",-1);
		this.playing = false;
		
		return this;
	};
	
	Vixen.prototype.fullscreen = function() {
		if (!this.isfullscreen) {
			this.requestFullScreen.call(this.ui.container);
			this.ui.container.c("fullscreen");
			this.ui.fullscreen.t("Exit Fullscreen");
			this.isfullscreen = true;
		} else {
			this.cancelFullScreen.call(document);
			this.ui.container.c("fullscreen",-1);
			this.ui.fullscreen.t("Fullscreen");
			this.isfullscreen = false;
		}
	};
	
	/*
		Public: Seeks the media to the specified time in seconds.
		
		time		-	Time in seconds - decimal precision allowed.
		
		Examples
		
			myVideo.jumpTo(100);
			myVideo.jumpTo(232.55);
		
		Returns the Vixen object against which this method was called.
	
	*/
	Vixen.prototype.jumpTo = function(time) {
		
		this.media.currentTime = time;
		this.updateUI();
		
		return this;
	};
	
	/*
		Public: Sets or returns the volume for a media element.
		
		volume		-	Optional number between 0 and 1 describing media volume.
		
		Examples
		
			var myVolume = myVideo.volume();
			myVideo.volume(0.5);
		
		Returns either the volume of the media element (if called without=
		arguments) or the Vixen object to which the volume was assigned (if
		called with arguments.)
	
	*/
	Vixen.prototype.volume = function(volume) {
		if (volume !== null) {
			
			if (typeof volume !== "number" || isNaN(volume))
				throw new Error("Non-numeric or NaN volume unacceptable.");
			
			if (volume < 0 || volume > 1)
				throw new Error("Volume outside of acceptable range.");
			
			if (volume === 0)
				this.ui.mute.t("Unmute");
			
			this.media.volume = volume;
			return this;
		} else {
			return this.media.volume;
		}
	}
	
	/*
		Public: Function for binding a handler to a Vixen event.
		
		eventName	-	String - name of event to bind handler to.
		handler		-	Function which is bound to the event.
		
		Examples
		
			myVideo.on("pause",updateMyAppUI);
			myVideo.on("stall",function() {
				console.log("Media stalled. Network issues?");
			});
		
		Returns the Vixen object to which the handler was bound.
	
	*/
	Vixen.prototype.on = function(eventName,handler) {
		// We must have a valid name...
		
		if (!eventName ||
			typeof eventName !== "string" ||
			eventName.match(/[^a-z0-9\.\*\-]/ig)) {
			
			throw new Error("Attempt to subscribe to event with invalid name!");
		}
		
		// We've gotta have a valid function
		if (!handler || !(handler instanceof Function)) {
			throw new Error("Attempt to subscribe to event without a handler!");
		}
		
		// OK, we got this far.
		// Create handler object if it doesn't exist...
		if (!this.eventHandlers || !(this.eventHandlers instanceof Object)) {
			this.eventHandlers = {};
		}
		
		if (this.eventHandlers[eventName] &&
			this.eventHandlers[eventName] instanceof Array) {
			
			this.eventHandlers[eventName].push(handler);
		} else {
			this.eventHandlers[eventName] = [handler];
		}
		
		return this;
	};
	
	
	/*
		Private: Called by Vixen internally when emitting an event. This
		function is responsible for calling all the event handlers in turn.
		
		eventName	-	used to determine which event is being emitted.
		
		Examples
		
			this.emit("pause");
			
		Returns the Vixen object which emitted the event in question.
	
	*/
	Vixen.prototype.emit = function(eventName) {
		var self = this, args = arguments;
		
		// If we've lost our handler object, or have no handlers, just return.
		if (!this.eventHandlers) return;
		
		// Ensure we've got handlers in the format we expect...
		if (!this.eventHandlers[eventName] ||
			!(this.eventHandlers[eventName] instanceof Array)) return;
		
		// OK, so we have handlers for this event.
		this.eventHandlers[eventName]
			// We need these to be functions!
			.filter(function(handler) {
				return handler instanceof Function;
			})
			.forEach(function(handler) {
				// Execute each handler in the context of the Vixen object,
				// and with the arguments we were passed (less the event name)
				handler.apply(self,[].slice.call(args,1));
			});
		
		
		
		return this;
	};
	
	// Static functions
	
	/*
		Public: Static function for generating and initialising Vixen objects
		for media on the page.
		
		selector	-	input to convert to Vixen media. Can be a query selector
						specifying one or more media objects, an array with
						either queryselectors /or/ media objects, or a single
						media object. Vixen will resolve them accordingly.
		
		Examples
		
			Vixen.ify("#myVideo")
			Vixen.ify("video")
			Vixen.ify("#content .media .soundbites")
			Vixen.ify([myVideoObject1, myVideoObject2]);
			Vixen.ify(myVideoObject);
		
		Returns either an array of Vixen objects, or a single object - depending
		on whether one or many media elements were matched by the input
		selector.
	
	*/
	Vixen.ify = function(selector) {
		var media = Vixen.get(selector);
		
		if (!media)
			throw new Error("Requested media object not found.");
		
		if (typeof media === "array")
			return media;
		
		if (media instanceof Vixen)
			return media;
		
		// OK. We're just dealing with one object then!
		return new Vixen(media);
	};
	
	/*
		Public: Static function for converting selectors to actual objects Vixen
		can deal with.
		
		selector	-	input to convert to Vixen media. Can be a query selector
						specifying one or more media objects, an array with
						either queryselectors /or/ media objects, or a single
						media object. Vixen will resolve them accordingly.
		
		Examples
		
			Vixen.get("#myVideo")
			Vixen.get("video")
			Vixen.get("#content .media .soundbites")
			Vixen.get([myVideoObject1, myVideoObject2]);
			Vixen.get(myVideoObject);
		
		Returns either an array of Vixen objects, or a single media object -
		depending on whether one or many media elements were matched by the
		input selector.
	
	*/
	Vixen.get = function(selector) {
		var result = null;
		
		if (selector instanceof HTMLVideoElement ||
			selector instanceof HTMLAudioElement) {
			
			return selector;
			
		} else {
			if (typeof selector === "array") {
				result = selector.map(Vixen.ify);
			
			} else if (typeof selector == "string") {
				selector = [].slice.call(document.querySelectorAll(selector));
				result = selector.map(Vixen.ify);
			}
			
			if (result.length === 1)
				return result[0];
			
			return result;
		}
		
		return false;
	};
	
	/*
		Public: Static function for getting the vendor-prefixed function using
		an unprefixed name. The function simply does a case-insensitive search
		through the `lookIn` object (which defaults to window if unspecified.)
		
		name		-	the name of the function to search for.
		lookIn		-	the object in which to look for the function.
		
		Examples
		
			Vixen.unprefix("requestFullScreen")
		
		Returns the function in question, or false if a matching function could
		not be located.
	
	*/
	Vixen.unprefix = function(name,lookIn) {
		lookIn = lookIn || window;
		name = name.replace(/[^a-z0-9\_]/ig,"");
		
		var search = new RegExp(name + "$","ig");
		
		// No hasOwnProperty here!
		for (var fName in lookIn) {
			if (search.exec(fName)) {
				return lookIn[fName];
			}
		}
		
		// No match?
		return false;
	};
	
	
	// Publish existence of object
	if (typeof module !== "undefined" && module.exports) {
		module.exports = Vixen;
	} else if (typeof define !== "undefined") {
		 define("vixen", [], function() { return Vixen; });
	} else {
		glob.Vixen = Vixen;
	}
})(this);