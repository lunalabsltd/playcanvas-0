pc.extend(pc, function () {
    
    /**
     * @component
     * @name pc.ScreenComponent
     * @description Create a new ScreenComponent
     * @class This components makes an entity become a root for a heirarchy of UI elements (please see {@link pc.ElementComponent}).
     * Apart from serving as the root node of UI elements, the screen component also defines UI sizing and scaling rules.
     * There are 3 distinct modes in which the screen component operates: screen-space, camera-space and world-space.
     * Screen-space mode simply draws all UI elements on top of the whole scene using an ortho projection. The size of screen,
     * and therefore the sizing rules of all nested elements are thus expressed in screen pixels. Whenever a screen resizes,
     * the sizes and positioning of all children are recomputed to match the new screen resolution.
     * Camera-space mode is very similar to the screen-space, but the screen is placed onto a plane somewhere in front of the camera,
     * allowing other world objects to be drawn on top of it. The most common application is apply 3D transforms to the whole
     * UI stack – but keep in mind nested elements are still using ortho projection when placed on the screen. One can add
     * special effects like placing particle system on top of the screen to make the UI even more interactive.
     * World-space mode is for the cases when the UI should be first-class citizen in the game world. No resolution is accounted in
     * this mode and elements are sized in world units.
     * To control how the UI is scaled the screen exposes a scale mode and a reference resolution parameters. If a scale mode is
     * set to ScreenComponent.SCALEMODE_BLEND, the screen will use scaleBlend parameter to decide on what the size of the screen
     * should be, trying to match width (scaleBlend = 0), height (scaleBlend = 1) or interpolate between the two in some way.
     * This setting can be used if the UI is created for a certain resolution (say, 1400x700) and the develop wants to scale
     * everything (including font sizes, corner offsets etc) proportionally as the resolution changes.
     * @param {pc.ScreenComponentSystem} system The ComponentSystem that created this Component
     * @param {pc.Entity} entity The Entity this Component is attached to
     * @extends pc.Component
     * @property {pc.Vec2} resolution The resolution to apply. Please note setting this value has no effect for screen-space screen.
     * @property {pc.Color} debugColor Color of the debug outline.
     * @property {pc.Vec2} referenceResolution The reference resolution for screen scaling.
     * @property {String} screenType Type of the screen rendering mode.
     * <ul>
     * <li>{@link pc.SCREEN_TYPE_WORLD}: World screen – no scaling, units are meters.</li>
     * <li>{@link pc.SCREEN_TYPE_CAMERA}: Camera screen – units being pixels.</li>
     * <li>{@link pc.SCREEN_TYPE_SCREEN}: Screen space – units being pixels.</li>
     * </ul>
     * @property {Number} screenDistance (Only for pc.SCREEN_TYPE_CAMERA) The distance from camera to place the screen plane to.
     * @property {String} scaleMode The way the screen reacts to resolution changes.
     * <ul>
     * <li>{@link ScreenComponent.SCALEMODE_NONE}: No scale blending, use the actual resolution.</li>
     * <li>{@link ScreenComponent.SCALEMODE_BLEND}: Blend actual and reference resolution using scaleBlend factor.</li>
     * </ul>
     * @property {Number} scaleBlend The portions of height and width for resolution blending.
     * @property {pc.Camera} camera The camera to use for screen positioning (only for pc.SCREEN_TYPE_WORLD mode).
     */

    var ScreenComponent = function ScreenComponent (system, entity) {
        pc.Component.call(this, system, entity);
        
        this._resolution = new pc.Vec2(this.system.app.graphicsDevice.width, this.system.app.graphicsDevice.height);
        this._referenceResolution = new pc.Vec2(640,320);
        this._offset = new pc.Vec2(0, 0);
        this._scaleMode = pc.ScreenComponent.SCALEMODE_NONE;
        this.scale = 1;
        this._scaleBlend = 0.5;
        this._debugColor = null;

        this._screenType = pc.SCREEN_TYPE_CAMERA;
        this._screenDistance = 1.0;

        this._screenMatrix = new pc.Mat4();
        this._inverseScreenMatrix = new pc.Mat4();

        system.app.graphicsDevice.on("resizecanvas", this._onResize, this);
    };

    ScreenComponent.prototype = Object.create(pc.Component.prototype);
    ScreenComponent.prototype.constructor = ScreenComponent;

    ScreenComponent.SCALEMODE_NONE = "none";
    ScreenComponent.SCALEMODE_BLEND = "blend";

    var _transform = new pc.Mat4();

    pc.extend(ScreenComponent.prototype, {

        _updateScreenInChildren: function () {
            for(var i = 0; i < this.entity._children.length; i++) {
                var element = this.entity._children[i].element;

                if (element) {
                    element._updateScreen( element._findScreen(), true );
                }
            }

            this.syncDrawOrder();
        },

        // Draws a debug box transforming local-spaced corners using current transformation matrix.
        // Helps to understand where the bounds of the screen really are.
        _drawDebugBox: function (dt) {
            var p = new pc.Vec3(0, 0, 0);
            var r = this.entity.right.clone().scale(this._resolution.x).sub(new pc.Vec3(0, 0, 0));
            var u = this.entity.up.clone().scale(this._resolution.y).sub(new pc.Vec3(0, 0, 0));

            // corners are obviously origin (0, 0, 0) plus all combinations of Right
            // and Up vectors, which have the length of horizontal and vertical resolution
            // respectively
            var corners = [
                p.clone().add(u).add(new pc.Vec3(0, 0, 0)),
                p.clone().add(r).add(u),
                p.clone().add(r).add(new pc.Vec3(0, 0, 0)),
                p.clone().add(new pc.Vec3(0, 0, 0))
            ];

            // the points denote the lines between the corners.
            var points = [
                corners[0], corners[1],
                corners[1], corners[2],
                corners[2], corners[3],
                corners[3], corners[0]
            ];

            var transform = this._screenMatrix;

            // we use _screenMatrix to do the transforms as that's the matrix
            // all nested components rely on
            for(var i = 0; i < points.length; i++) {
                points[i] = transform.transformPoint( points[i] );
            }

            // use immediate API to avoid material and transform glitches
            this.system.app.renderLines(points, this._debugColor, this._screenType == pc.SCREEN_TYPE_SCREEN ? pc.LINEBATCH_SCREEN : pc.LINEBATCH_WORLD);
        },

        syncDrawOrder: function () {
            var system = pc.Application.getApplication().systems.screen;
            
            if (system) {
                system._dirtyOrder = true;
            }
        },

        _calcProjectionMatrix: function () {
            var near = 1E5;
            var far = -1E5;

            var w = this._resolution.x / this.scale;
            var h = this._resolution.y / this.scale;

            // default screen matrix is obviously plain ortho one: UI space with (0, 0) origin
            // at the lower left corner and (w, h) in size maps onto clipspace of the device.
            this._screenMatrix.setOrtho(0, this._resolution.x, 0, this._resolution.y, near, far);

            var camera = this.camera;
            var screenType = this._screenType;

            if (!camera && screenType == pc.SCREEN_TYPE_CAMERA) {
                screenType = pc.SCREEN_TYPE_SCREEN;
            }

            // do we follow the camera?
            if ( screenType == pc.SCREEN_TYPE_CAMERA ) {
                if ( camera.projection == pc.PROJECTION_PERSPECTIVE ) {
                    this._planeHeight = Math.tan( camera.fov / 2.0 * Math.PI / 180.0 ) * Math.abs( 2 * this._screenDistance );
                } else {
                    this._planeHeight = camera.orthoHeight * 2.0;
                }

                // compose a transform to convert screen points into world space onto the screen plane (whether it's ortho or perspective)
                this._screenMatrix.setIdentity();
            } else if ( screenType == pc.SCREEN_TYPE_WORLD ) {
                // world-space camera couldn't be simplier: it doesn't transform object's coordinates
                this._screenMatrix.setIdentity();
                w = 0;
                h = 0;
            }

            this._width = w;
            this._height = h;

            this.entity._dirtyLocal = true;
            this.entity._dirtyWorld = true;

            // check if the parent element has screen attached; if it does, matrix
            // and resolution should be borrowed from there
            if (this.entity.parent && this.entity.parent.screen) {
                var screen = this.entity.parent.screen;

                this._screenMatrix.copy( screen._screenMatrix );

                this._width = screen._width;
                this._height = screen._height;
            }

            // compute inverse screen matrix for ray casts and pointer clicks
            // (conviently, it will convert points from world space )
            this._inverseScreenMatrix.copy( this._screenMatrix ).invert();
        },

        onRemove: function () {
            if ( this._camera ) {
                this._camera._detachScreen( this );
            }
        },

        _updateScale: function () {
            this.scale = this._calcScale(this._resolution, this.referenceResolution)
        },

        _calcScale: function (resolution, referenceResolution) {
            // Using log of scale values
            // This produces a nicer outcome where if you have a xscale = 2 and yscale = 0.5
            // the combined scale is 1 for an even blend
            var lx = Math.log2(resolution.x / referenceResolution.x);
            var ly = Math.log2(resolution.y / referenceResolution.y);
            return Math.pow(2, (lx*(1-this._scaleBlend) + ly*this._scaleBlend));
        },

        _onResize: function (width, height) {
            var camera = this.camera;

            if (camera && camera.renderTarget) {
                width = camera.renderTarget.width;
                height = camera.renderTarget.height;
            }

            if (this._screenType != pc.SCREEN_TYPE_WORLD) {
                this._resolution.set(width, height);
                this.resolution = this._resolution; // force update
            }
        },

        _updateStencilParameters: function () {
            var ref     = 255;
            var masking = 0;
            var self    = this;

            var walker = function (root) {
                var element = root.element;
                
                if (element) {
                    element._stencilLayer = ref;
                    element._masked = masking > 0;

                    if (element._image && element._image._masksChildren) {
                        element._topMostMask = masking == 0;
                        masking++;

                        element._stencilLayer -= 1;
                        ref -= 1;
                    }
                }

                for(var i = 0; i < root._children.length; i++) {
                    walker( root._children[i] );
                }

                if (element && element._image) {
                    if (element._image._masksChildren) {
                        masking--;
                    }

                    element._image._updateMaterial(self.screenType == pc.SCREEN_TYPE_SCREEN);
                }

                if (element && element._text) {
                    element._text._updateMaterial(self.screenType == pc.SCREEN_TYPE_SCREEN);
                }
            }

            if (this.entity) {
                walker( this.entity )
            }
        }

    });

    /**
    * @name pc.ScreenComponent#resolution
    * @type pc.Vec2
    * @description The resolution to use for screen rendering. The value will be ignored for screen-space screens, and
    * will overwrite reference resolution is scaling mode is set to none. If the screen scaling is enabled, the screen
    * will compute the scaling factor to match the height and width difference and will scale all elements accordingly.
    */
    Object.defineProperty(ScreenComponent.prototype, "resolution", {
        set: function (value) {
            var camera = this.camera;

            if ( camera && camera.renderTarget ) {
                return;
            }

            if ( this._screenType != pc.SCREEN_TYPE_SCREEN ) {
                this._resolution.set(value.x, value.y);
            } else if ( !camera || !camera.renderTarget ) {
                // ignore input when using screenspace.
                this._resolution.set(this.system.app.graphicsDevice.width, this.system.app.graphicsDevice.height);
            }

            if (this._scaleMode === pc.ScreenComponent.SCALEMODE_NONE) {
                this.referenceResolution = this._resolution;
            }

            this._updateScale();

            this._calcProjectionMatrix();
            this.fire("set:resolution", this._resolution);
        },
        get: function () {
            return this._resolution;
        }
    });

    /**
    * @name pc.ScreenComponent#debugColor
    * @type pc.Color
    * @description The color for the debug outline of the screen. When set to a non-null value, the screen will draw
    * a box to indicate what are the actual bounds it takes. Please use that for debugging purposes only as the debug outline
    * has very poor rendering performance.
    * @example
    * // make element show it's layout box in red.
    * var element = this.entity.screen;
    * screen.debugColor = new pc.Color( 1, 0, 0 );
    */
    Object.defineProperty(ScreenComponent.prototype, "debugColor", {
        get: function () {
            return this._debugColor;
        },

        set: function (value) {
            this._debugColor = value;

            if (this._debugColor) {
                pc.ComponentSystem.on("update", this._drawDebugBox, this);
            } else {
                pc.ComponentSystem.off("update", this._drawDebugBox, this);
            }
        }
    });

    Object.defineProperty(ScreenComponent.prototype, "offset", {
        set: function (value) {
            this._offset.set(value.x, value.y);
            this._calcProjectionMatrix();
        },
        get: function () {
            return this._offset;
        }
    });

    /**
    * @name pc.ScreenComponent#referenceResolution
    * @type pc.Vec2
    * @description The reference resolution to compute screen scaling against. This is usually the size of UI mockups used
    * to create and lay out the interface components from, allowing to specify font sizes, sprite borders, corner offsets etc
    * in pixels and have everything scaled up or down for higher or lower resolutions.
    */
    Object.defineProperty(ScreenComponent.prototype, "referenceResolution", {
        set: function (value) {
            this._referenceResolution.set(value.x, value.y);

            this._updateScale();
            this._calcProjectionMatrix();

            this.fire("set:referenceresolution", this._resolution);
        },
        get: function () {
            if (this._scaleMode === pc.ScreenComponent.SCALEMODE_NONE) {
                return this._resolution;
            } else {
                return this._referenceResolution;
            }
        }
    });

    /**
    * @name pc.ScreenComponent#screenType
    * @type String
    * @description The type of the screen, being either {@link pc.SCREEN_TYPE_WORLD}, {@link pc.SCREEN_TYPE_SCREEN} or
    * {@link pc.SCREEN_TYPE_CAMERA}.
    */
    Object.defineProperty(ScreenComponent.prototype, "screenType", {
        set: function (value) {
            this._screenType = value;
            
            if (this._screenType == pc.SCREEN_TYPE_SCREEN) {
                this._resolution.set(this.system.app.graphicsDevice.width, this.system.app.graphicsDevice.height);
            }

            this.resolution = this._resolution;

            this.fire('set:screentype', this._screenType);
        },
        get: function () {
            return this._screenType;
        }
    });

    /**
    * @name pc.ScreenComponent#screenDistance
    * @type Number
    * @description Only for {@link pc.SCREEN_TYPE_CAMERA}: where to place the UI plane in camera's sight. Please note that
    * placing the screen to close or too far to the camera will make it be discarded due to near / far plane clipping. Use that
    * to control the amount of pespective distortion visible on the screen elements or to aling the screen in relation to
    * other objects in the scene.
    */
    Object.defineProperty(ScreenComponent.prototype, "screenDistance", {
        set: function (value) {
            this._screenDistance = value;
            this._calcProjectionMatrix();
        },
        get: function () {
            return this._screenDistance;
        }
    });

    /**
    * @name pc.ScreenComponent#scaleMode
    * @type String
    * @description Setting this property to {@link ScreenComponent.SCALEMODE_BLEND} will make the screen scale its contents
    * in accordance with scaleBlend value, trying to match height or width or a blend of the two. The screen will still take
    * full viewport in screen-space and camera-space mode, but all elements will appear "up" or "down" scaled. This is useful
    * to prevent the buttons and texts become too big or small for certain resolutions: when scaling is disabled the screen
    * just uses target pixel resolution, and in this case having a button, of, say 100x50 pixels might look too small if it was
    * designed for a lower pixel resolution initially.
    */
    Object.defineProperty(ScreenComponent.prototype, "scaleMode", {
        set: function (value) {
            if (value !== pc.ScreenComponent.SCALEMODE_NONE && value !== pc.ScreenComponent.SCALEMODE_BLEND) {
                value = pc.ScreenComponent.SCALEMODE_NONE;
            }

            // world space screens do not support scale modes
            if (this._screenType == pc.SCREEN_TYPE_WORLD && value !== pc.ScreenComponent.SCALEMODE_NONE) {
                value = pc.ScreenComponent.SCALEMODE_NONE;
            }

            this._scaleMode = value;
            this.resolution = this._resolution; // force update
            this.fire("set:scalemode", this._scaleMode);
        },
        get: function () {
            return this._scaleMode;
        }
    });

    /**
    * @name pc.ScreenComponent#scaleBlend
    * @type Number
    * @description When screen scaling is enabled, controls the resulting scale of the screen. This parameter exists as it's
    * generally unsafe to scale UI elements in an unproportional manner, so the UI should be unfiromely scaled at all times.
    * In order to decide for how much to scale the UI, when the target width, is, for instance, 5 times the design width and
    * target height is 2 times the design one, scaleBlend parameter lerps between the two scales to produce the resulting
    * scale to use.
    */
    Object.defineProperty(ScreenComponent.prototype, "scaleBlend", {
        set: function (value) {
            this._scaleBlend = value;
            this._updateScale();
            this._calcProjectionMatrix();
            this.fire("set:scaleblend", this._scaleBlend);
        },
        get: function () {
            return this._scaleBlend;
        }
    });

    /**
    * @name pc.ScreenComponent#camera
    * @type pc.Camera
    * @description The camera entity to use for positioning computations (has real effects to camera-space mode only).
    * If no camera is set, will use the first camera found in the scene.
    */
    Object.defineProperty(ScreenComponent.prototype, "camera", {
        set: function (value) {
            if ( this._camera ) {
                this._camera._detachScreen( this );
            }

            this._camera = value;

            if ( this._camera ) {
                this._camera._attachScreen( this );
            }

            if (value && value.renderTarget != null) {
                // for the case of a camera rendering to a render target, we actually need to update the resolution
                this._resolution.set( value.renderTarget.width, value.renderTarget.height );
            }

            this._calcProjectionMatrix();
        },
        get: function () {
            if ( this._camera ) {
                return this._camera;
            }

            var mainCamera = UnityEngine.Camera.getmain();

            if ( mainCamera ) {
                return mainCamera.handle.camera;
            }
        }
    });

    return {
        ScreenComponent: ScreenComponent,

        SCREEN_TYPE_WORLD: "world",
        SCREEN_TYPE_CAMERA: "camera",
        SCREEN_TYPE_SCREEN: "screen"
    };
}());

