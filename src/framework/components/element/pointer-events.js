pc.extend(pc, function() {

    var POINTER_TEST_RESULT_PASS            = 0;
    var POINTER_TEST_RESULT_PASS_THROUGH    = 1;
    var POINTER_TEST_RESULT_FAIL            = 2;

    var ray = { origin: new pc.Vec3, direction: new pc.Vec3 };
    var pointerPosition = new pc.Vec3;

    var _buttonsDown = {};

    function cleanupDownButtons() {
        for(var guid in _buttonsDown) {
            _buttonsDown[ guid ].fire( pc.POINTEREVENT_UP, pointerPosition );
        }

        _buttonsDown = {};
    }

    var PointEventsManager = {

        // Tests if the pointer event with coordinates passed (in local coord space)
        // falls into the bounds of the current element and should be processed by it
        // or its children.
        _testPointerEvent: function(point) {
            if (!this.entity || !this.entity.enabled) {
                return POINTER_TEST_RESULT_FAIL;
            }

            // if (this._rootPointerEventReceiver) {
            //     return POINTER_TEST_RESULT_PASS_THROUGH;
            // }

            var failureResult = POINTER_TEST_RESULT_FAIL;

            var w = (this.entity.element ? this.entity.element._width : this._width);
            var h = (this.entity.element ? this.entity.element._height : this._height);

            if (w == 0 || h == 0 || this.entity.localScale.x < 0 || this.entity.localScale.y < 0) {
                failureResult = POINTER_TEST_RESULT_PASS_THROUGH;
            }

            // having NO single script means it's just a rect transform, which does nothing to raycasts
            if (!this.entity.script) {
                failureResult = POINTER_TEST_RESULT_PASS_THROUGH;   
            }

            if ((point.x >= 0) && (point.y >= 0) && (point.x <= w) && (point.y <= h)) {
                return POINTER_TEST_RESULT_PASS;
            } else {
                return failureResult;
            }
        },

        // Converts supplied screen point to "world-space" ray. "World-space" is not literally
        // worldspace as in case of screen space canvas it's in fact screen-space.
        _screenPointToRay: function (point) {
            point.x *= this.system.app.graphicsDevice.width / this.system.app.graphicsDevice.canvas.scrollWidth;
            point.y *= this.system.app.graphicsDevice.height / this.system.app.graphicsDevice.canvas.scrollHeight;

            // if we are screen-space guys, camera transforms will be no help – we are 
            // using our own ortho matrix anyway
            if (this._screenType == pc.SCREEN_TYPE_SCREEN) {
                ray.origin.set(
                    (point.x / this.system.app.graphicsDevice.width - 0.5) * 2, 
                    (0.5 - point.y / this.system.app.graphicsDevice.height) * 2, 
                    1000
                );

                ray.direction.set(
                    0,
                    0,
                    -1
                );
            } else {
                var camera = this.camera;

                camera.screenToWorld( point.x, point.y, camera.farClip, this.system.app.graphicsDevice.width, this.system.app.graphicsDevice.height, ray.direction );
                camera.screenToWorld( point.x, point.y, camera.nearClip, this.system.app.graphicsDevice.width, this.system.app.graphicsDevice.height, ray.origin );

                ray.direction.sub( ray.origin );
                ray.direction.normalize();
            }

            return ray;
        },

        // Raycasts the ray in "world-space" to local coordinates of the element.
        _rayToLocalPoint: function (ray) {
            if (!this.entity.element) {
                if (this.entity.screen) {
                    return pointerPosition.clone().scale(1 / this.entity.screen.scale);
                } else {
                    return pointerPosition;
                }
            }

            // FIXME: A proper check for "inherit" screen type needed
            if (this.entity.screen && this.entity.parent.screen) {
                return pointerPosition;
            }

            var wt  = this.entity.worldTransform;
            var iwt = this.entity.inverseWorldTransform;

            var l0 = ray.origin.clone();
            var l  = ray.direction.clone();

            var p0 = this.entity.getPosition();
            var n  = wt.transformVector( new pc.Vec3( 0, 0, -1 ) ).normalize();

            var t  = p0.sub(l0).dot(n) / l.dot(n);
            var p  = l0.add( l.scale(t) );

            return iwt.transformPoint(p).add( this.entity.element._pivotPoint );
        },

        // Iterates over all children and passes the event through to them.
        _passPointerEventToChildren: function(name, eventData) {
            for (var i = this.entity.children.length - 1; i >= 0; i--) {
                var child =  this.entity.children[i];
                
                if (child && child.element && child.enabled && (!child.element.screen || child.element.screen.enabled)) {
                    var result = child.element[ name ].apply( child.element, eventData );

                    if (result) {
                        return true;
                    }
                }
            }

            return false;
        },

        respondsTo: function () {
            for (var i = 0; i < arguments.length; i++) {
                var responds = this.hasListeners( arguments[i] ) || (this.entity.element && this.entity.element.hasListeners( arguments[i] ));

                if (responds) {
                    return true;
                }
            }

            return false;
        },

        // Handles "down" pointer event – might be coming from touch or
        // a mouse.
        _pointerEventDown: function( ray, nearestControl ) {
            var point = this._rayToLocalPoint( ray );

            var testResult = this._testPointerEvent( point );

            if (testResult == POINTER_TEST_RESULT_FAIL) {
                return false;
            }

            if (this.entity.element && (this.entity.element['UnityEngine.UI.Button'] || this.entity.element['UnityEngine.UI.Toggle'] || this.entity.element['UnityEngine.UI.Slider'])) {
                nearestControl = this;
            }

            if ( this._passPointerEventToChildren("_pointerEventDown", [ ray, nearestControl ]) ) {
                return true;
            }
            
            if (testResult == POINTER_TEST_RESULT_PASS) {
                var receiver = nearestControl || this;

                _buttonsDown[ receiver.entity._guid ] = receiver;
                receiver.fire(pc.POINTEREVENT_DOWN, point);

                return receiver.respondsTo( pc.POINTEREVENT_DOWN );
            } else {
                return false;
            }
        },

        // Handles "up" pointer event – might be coming from touch or
        // a mouse.
        _pointerEventUp: function( ray, nearestControl ) {
            var point = this._rayToLocalPoint( ray );

            var testResult = this._testPointerEvent(point);

            if (testResult == POINTER_TEST_RESULT_FAIL) {
                return false;
            }

            if (this.entity.element && (this.entity.element['UnityEngine.UI.Button'] || this.entity.element['UnityEngine.UI.Toggle'] || this.entity.element['UnityEngine.UI.Slider'])) {
                nearestControl = this;
            }

            if ( this._passPointerEventToChildren("_pointerEventUp", [ ray, nearestControl ]) ) {
                return true;
            }
            
            if (testResult == POINTER_TEST_RESULT_PASS) {
                var receiver = nearestControl || this;

                receiver.fire(pc.POINTEREVENT_CLICK, point);
                receiver.fire(pc.POINTEREVENT_UP, point);

                delete _buttonsDown[ receiver.entity._guid ];

                return receiver.respondsTo( pc.POINTEREVENT_UP, pc.POINTEREVENT_CLICK );
            } else {
                return false;
            }
        },

        // Fires pointer leave event and also makes all children do so.
        _ensurePointerLeaveEvent: function( ray ) {
            var point = this._rayToLocalPoint( ray );

            this._pointerOver = false;
            this.fire(pc.POINTEREVENT_LEAVE, point); 

            this._passPointerEventToChildren( "_ensurePointerLeaveEvent", [ ray ]);

            return false;
        },

        // Handles "move" pointer event – might be coming from touch or
        // a mouse.
        _pointerEventMove: function( ray ) {
            var point = this._rayToLocalPoint( ray );

            var testResult = this._testPointerEvent(point);

            if (testResult == POINTER_TEST_RESULT_FAIL) {
                if (this._pointerOver) {
                    this._ensurePointerLeaveEvent( ray );            
                }

                return false;
            }

            if (this.entity.element) {
                var control = (this.entity.element['UnityEngine.UI.Button'] || this.entity.element['UnityEngine.UI.Toggle']);

                if (control) {
                    nearestControl = this;
                }

                if (control && control.m_Interactable) {
                    document.body.style.cursor = 'pointer';
                }
            }

            if ( this._passPointerEventToChildren("_pointerEventMove", [ ray ]) ) {
                return true;
            }

            if (!this._pointerOver) {
                this._pointerOver = true;
                this.fire(pc.POINTEREVENT_ENTER, point);                
            }

            this.fire(pc.POINTEREVENT_MOVE, point);
            return this.respondsTo( pc.POINTEREVENT_MOVE, pc.POINTEREVENT_ENTER );
        },

        // Handles "scroll" pointer event – might be coming from touch or
        // a mouse.
        _pointerEventScroll: function( ray, amount ) {
            var point = this._rayToLocalPoint( ray );

            var testResult = this._testPointerEvent(point);

            if (testResult == POINTER_TEST_RESULT_FAIL) {
                return false;
            }

            if ( this._passPointerEventToChildren("_pointerEventScroll", [ ray, amount ]) ) {
                return true;
            }

            if (testResult == POINTER_TEST_RESULT_PASS) {
                this.fire(pc.POINTEREVENT_SCROLL, point, amount);
                return this.respondsTo( pc.POINTEREVENT_SCROLL );
            } else {
                return false;
            }
        },

        // Mouse-specific event handler.
        _onMouseDown: function(mouseEvent) {
            // if (this.entity.parent && this.entity.parent.screen) {
            //     return false;
            // }

            // We support only left mouse button
            if (!mouseEvent.button == 0) {
                return;
            }

            if (!this.entity || !this.entity.enabled) {
                return false;
            }

            pointerPosition.set( mouseEvent.x, mouseEvent.y, 0 );
            return this._pointerEventDown( this._screenPointToRay( pointerPosition ) );
        },

        // Mouse-specific event handler.
        _onMouseUp: function(mouseEvent) {
            // if (this.entity.parent && this.entity.parent.screen) {
            //     return false;
            // }

            // We support only left mouse button
            if (!mouseEvent.button == 0) {
                return;
            }

            if (!this.entity || !this.entity.enabled) {
                return false;
            }

            pointerPosition.set( mouseEvent.x, mouseEvent.y, 0 );
            
            var result = this._pointerEventUp( this._screenPointToRay( pointerPosition ) );
            cleanupDownButtons();

            return result;
        },

        // Mouse-specific event handler.
        _onMouseMove: function(mouseEvent) {
            // if (this.entity.parent && this.entity.parent.screen) {
            //     return false;
            // }

            document.body.style.cursor = 'default';

            if (!this.entity || !this.entity.enabled) {
                return false;
            }

            pointerPosition.set( mouseEvent.x, mouseEvent.y, 0 );
            return this._pointerEventMove( this._screenPointToRay( pointerPosition ) );
        },

        // Touch-specific event handler.
        _onMouseWheel: function(mouseEvent) {
            if (!this.entity || !this.entity.enabled) {
                return false;
            }

            pointerPosition.set( mouseEvent.x, mouseEvent.y, 0 );
            return this._pointerEventScroll( this._screenPointToRay( pointerPosition ), mouseEvent.wheel );
        },

        // Touch-specific event handler.
        _onTouchUp: function(touchEvent) {
            if (!this.entity || !this.entity.enabled) {
                return false;
            }

            var touch = touchEvent.changedTouches[0];
            
            pointerPosition.set( touch.x, touch.y, 0 );
            return this._pointerEventUp( this._screenPointToRay( pointerPosition ) );
        },

        // Touch-specific event handler.
        _onTouchDown: function(touchEvent) {
            if (!this.entity || !this.entity.enabled) {
                return false;
            }

            var touch = touchEvent.changedTouches[0];
            
            pointerPosition.set( touch.x, touch.y, 0 );
            return this._pointerEventDown( this._screenPointToRay( pointerPosition ) );
        },

        // Touch-specific event handler.
        _onTouchMove: function(touchEvent) {
            if (!this.entity || !this.entity.enabled) {
                return false;
            }
            
            var touch = touchEvent.changedTouches[0];
            
            pointerPosition.set( touch.x, touch.y, 0 );
            return this._pointerEventMove( this._screenPointToRay( pointerPosition ) );
        }

    };

    // we mix point events in to both Screen and Element so that the whole UI stack
    // becomes mouse/touch events-aware.
    pc.extend( pc.ScreenComponent.prototype, PointEventsManager );
    pc.extend( pc.ElementComponent.prototype, PointEventsManager );

    return {
        POINTEREVENT_MOVE: "pointer:move",
        POINTEREVENT_UP: "pointer:up",
        POINTEREVENT_DOWN: "pointer:down",
        POINTEREVENT_CLICK: "pointer:click",
        POINTEREVENT_SCROLL: "pointer:scroll",
        POINTEREVENT_ENTER: "pointer:enter",
        POINTEREVENT_LEAVE: "pointer:leave",
    };
}());