/*
 * Copyright (C) 2015 Jordan Mc
 * URL: https://github.com/jordanmc/spotlight-js
 * 
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2.1 of the License, or (at your option) any later version.
 * 
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 * 
 * You should have received a copy of the GNU Lesser General Public
 * License along with this library; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301  USA
 */

(function(window) {
	'use strict';

	var debugMode = false;

	function debug() {
		if (debugMode && window.console && console.log) {
			console.log.apply(self, arguments);
		}
	}

	window.Spotlight = new function() {
		var self = this, priv = {};

		priv.overlays = Object.create(null);
		priv.activeOverlay = null;
		
		self.createOverlay = function(id, options) {
			if (priv.overlays[id]) {
				throw Error('Overlay already exists:' + id);
			}
			
			priv.overlays[id] = new SpotlightOverlay(id, options, priv);
			
			return priv.overlays[id];
		};
		
		self.destroyOverlay = function(id) {
			if (priv.overlays[id]) {
				self.hideOverlay(id);
				priv.overlays[id]._priv.destroy();
				delete priv.overlays[id];
			}
		};

		self.destroyAllOverlays = function() {
			Object.keys(priv.overlays).forEach(function(overlayID) {
				self.destroyOverlay(overlayID);
			});
		};
		
		self.showOverlay = function(id) {
			if (!priv.overlays[id] || priv.activeOverlay == priv.overlays[id]) {
				return false;
			}
			
			if (priv.activeOverlay) {
				self.hideOverlay(priv.activeOverlay._priv.id);
			}
			priv.activeOverlay = priv.overlays[id];
			priv.overlays[id]._priv.show();
			
			priv.setEnableInputBlocking(!!priv.activeOverlay._priv.options.disableInput);
		};
		
		self.hideOverlay = function(id) {
			if (priv.overlays[id] == priv.activeOverlay) {
				priv.overlays[id]._priv.hide();
				priv.setEnableInputBlocking(false);
				priv.activeOverlay = null;
			}
		};
		
		self.getOverlayById = function(id) {
			return priv.overlays[id] || null;
		};
		
		priv.setEnableInputBlocking = function(enabled) {
			var events = ['click', 'keypress', 'mousedown', 'mouseup',
				'keydown', 'keyup', 'mousewheel', 'mouseover', 'scroll',
				'dragstart', 'drag', 'dragend', 'dragover', 'dragenter',
				'dragleave', 'dragdrop'];
			
			if (enabled) {
				debug('[Spotlight][setEnableInputBlocking] Enabled');
				events.forEach(function(name) {
					document.addEventListener(name, priv.onInputDetected, true);
				});
			} else {
				debug('[Spotlight][setEnableInputBlocking] Disabled');
				events.forEach(function(name) {
					document.removeEventListener(name, priv.onInputDetected, true);
				});
			}
		};
		
		priv.onInputDetected = function(e) {
			var inputWhitelist, alwaysBlockedEvents, i;
			
			inputWhitelist = priv.activeOverlay._priv.options.inputWhitelist || [];
			
			alwaysBlockedEvents = {
				mousewheel: 1, scroll: 1, dragstart: 1, drag: 1, dragend: 1,
				dragover: 1, dragenter: 1, dragleave: 1, dragdrop: 1
			};
			
			if (e.type in alwaysBlockedEvents) {
				debug('[Spotlight][onInputDetected] Blocking event type: ' + e.type);
				e.stopPropagation();
				e.preventDefault();
				return;
			}
			
			for (i = 0; i < inputWhitelist.length; i++) {
				debug(inputWhitelist[i]);
			
				if ($(inputWhitelist[i]).filter($(e.target)).size() > 0) {
					debug('[Spotlight][onInputDetected] Found match in whitelist:', inputWhitelist[i], e.target);
					return;
				}
			}
			
			e.stopPropagation();
			e.preventDefault();
			
			debug('[Spotlight][onInputDetected] No match. Stopping propagation.');
		};
	};

	function SpotlightOverlay(id, options, spotlightPriv) {
		var self = this, priv = self._priv = {};
		
		priv.id       = id;
		priv.lights   = Object.create(null);
		priv.pointers = Object.create(null);
		priv.$canvas  = null;
		priv.context  = null;
		priv.options  = options || Object.create(null);
		priv.lightCtr = 0;
		
		priv.init = function() {
			if (!id) {
				throw Error('Spotlight overlay requires a unique name.');
			}
			
			priv.createCanvas();
			self.updateDisplay();
			
			$(window).on('resize', priv.onResize);
		};
		
		priv.destroy = function() {
			priv.$canvas.remove();
			
			for (var id in priv.pointers) {
				self.removePointer(id);
			}
			
			$(window).off('resize', priv.onResize);
		};
		
		priv.onResize = function() {
			// Reduce to body size, then expand to document size.
			priv.$canvas.attr({
				'width': $('body').width(),
				'height': $('body').height()
			});
			priv.$canvas.attr({
				'width': $(document).width(),
				'height': $(document).height(),
			});
			self.updateDisplay();
		};
		
		self.addLight = function(id, x, y, w, h, $target) {
			if (!id) {
				id = String(priv.lightCtr);
			}
			
			if (priv.lights[id]) {
				throw Error('Light already exists by this ID.');
			} else if ($target && $target.size() <= 0) {
				throw Error('$target provided, but empty.');
			}
			
			priv.lightCtr++;
			priv.lights[id] = { id: id, x: x, y: y, w: w, h: h, $target: $target };
			self.updateDisplay();
			
			return priv.lights[id];
		};
		
		self.removeLight = function(id) {
			if (priv.lights[id]) {
				delete priv.lights[id];
				self.updateDisplay();
			}
		};
		
		self.addPointer = function(id, x, y, $target) {
			if (!id) {
				id = String(priv.lightCtr);
			}
			
			if (priv.pointers[id]) {
				throw Error('Pointer already exists by this ID.');
			} else if ($target && $target.size() <= 0) {
				throw Error('$target provided, but empty.');
			}
			
			var $el = $('<div class="spotlight-overlay-pointer" />');
			$el.css({ left: x + 'px', top: y + 'px' }).hide().appendTo($('body'));
			
			priv.lightCtr++;
			priv.pointers[id] = { id: id, x: x, y: y, $target: $target, $el: $el };
			
			if (priv.$canvas.is(':visible')) {
				self.updateDisplay();
			}
			
			return priv.pointers[id];
		};
		
		self.removePointer = function(id) {
			if (priv.pointers[id]) {
				priv.pointers[id].$el.remove();
				delete priv.pointers[id];
				//self.updateDisplay();
			}
		};
		
		self.updateDisplay = function() {
			priv.context.fillStyle = 'black';
			priv.context.fillRect(0, 0, priv.$canvas[0].width, priv.$canvas[0].height);
			
			for (var id in priv.lights) {
				self.drawLight(priv.lights[id]);
			}
			
			for (var id in priv.pointers) {
				self.drawPointer(priv.pointers[id]);
			}
		};
		
		self.drawLight = function(light) {
			var x = light.x, y = light.y, offset;
			
			if (light.$target) {
				if (light.$target.size() <= 0) {
					return; // Skip lights with missing target.
				}
				
				// TODO: This may need to be done outside of draw loop.
				offset = light.$target.offset();
				x = x + offset.left + (light.$target.width() / 2);
				y = y + offset.top + (light.$target.height() / 2);
			}
			
			self.drawEllipseByCentre(x, y, light.w, light.h);
		};
		
		self.drawEllipse = function(x, y, w, h) {
			var scaleX, scaleY, invScaleX, invScaleY, grad;
			var rx = w / 2, ry = h / 2;
			var cx = x + w / 2, cy = y + h / 2;
			
			priv.context.globalCompositeOperation = 'destination-out';		
			priv.context.save();
			
			// Create a radial gradient, scaled up, which will then be distorted.
			if (rx >= ry) {
				scaleX = 1;
				scaleY = ry / rx;
				invScaleX = 1;
				invScaleY = rx / ry;
				grad = priv.context.createRadialGradient(cx, cy * invScaleY, 0, cx, cy * invScaleY, rx);
			} else {
				scaleY = 1;
				scaleX = rx / ry;
				invScaleY = 1;
				invScaleX = ry / rx;
				grad = priv.context.createRadialGradient(cx * invScaleX, cy, 0, cx * invScaleX, cy, ry);
			}
			
			priv.context.fillStyle = grad;
			
			// Create a set of colour stops to give the appearance of a spotlight.
			grad.addColorStop(0, 'rgba(0,0,0,1)');
			grad.addColorStop(0.5, 'rgba(0,0,0,1)');
			grad.addColorStop(0.7, 'rgba(0,0,0,0.5)');
			grad.addColorStop(1, 'rgba(0,0,0,0)');
			
			// Apply a transformation to distort the radial gradient.
			priv.context.setTransform(scaleX, 0, 0, scaleY, 0, 0);
			
			// Draw a rectangle containing the gradient.
			priv.context.fillRect(x * invScaleX, y * invScaleY, w * invScaleX, h * invScaleY);
			
			priv.context.restore();
			priv.context.globalCompositeOperation = 'source-over';
		};
		
		self.drawEllipseByCentre = function(cx, cy, w, h) {
			self.drawEllipse(cx - w/2.0, cy - h/2.0, w, h);
		};
		
		self.drawPointer = function(pointer) {
			var x = pointer.x, y = pointer.y, offset, dir = 'right', targetW, targetH;
			
			if (pointer.$target) {
				if (pointer.$target.size() <= 0) {
					return; // Skip pointers with missing target.
				}
				
				targetW = pointer.$target.width(),
				targetH = pointer.$target.height();
				
				offset = pointer.$target.offset();
				x = x + offset.left + (targetW / 2);
				y = y + offset.top + (targetH / 2);
				
				if (x < offset.left) {
					dir = 'right';
				} else if (y > offset.top + targetH) {
					dir = 'top';
				} else if (x >= offset.left + targetW) {
					dir = 'left';
				} else {
					dir = 'bottom';
				}
			}
			
			pointer.$el.css({ left: x + 'px', top: y + 'px' }).attr('data-dir', dir);
			
			if (!pointer.$el.is(':visible') && priv.$canvas.is(':visible')) { 
				pointer.$el.fadeIn();
			}
		};
		
		priv.createCanvas = function() {
			priv.$canvas = $('<canvas>').attr({
				'id': priv.id + '-overlay',
				'class': 'spotlight-overlay',
				'width': $(document).width(),
				'height': $(document).height()
			}).hide().appendTo($('body'));
			
			priv.context = priv.$canvas[0].getContext('2d');
		};
		
		priv.hide = function() {
			priv.$canvas.fadeOut();
			
			for (var id in priv.pointers) {
				priv.pointers[id].$el.fadeOut();
			}
		};
		
		priv.show = function() {
			self.updateDisplay();
			priv.$canvas.fadeIn();
			
			for (var id in priv.pointers) {
				priv.pointers[id].$el.fadeIn();
			}
		};
		
		priv.init();
	};
})(window);
