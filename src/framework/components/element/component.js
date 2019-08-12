pc.extend(pc, function () {
    pc.ELEMENTTYPE_GROUP    = 'group';
    pc.ELEMENTTYPE_IMAGE    = 'image';
    pc.ELEMENTTYPE_TEXT     = 'text';

    var _warning = false;
    var _tmpMatrix = new pc.Mat4();
    var _tmpVector = new pc.Vec3();

    /**
     * @component
     * @name pc.ElementComponent
     * @description Create a new ElementComponent
     * @class Allows an entity to participate in UI element hierarchy. Attaching this component to an entity makes it compute its
     * world transform using UI layout rules. The key principle of the UI layout is that every element has its own coordinate space
     * represented by a box with a specific width and height. The values for width and height are computed based on his parent's
     * dimensions using the concept of anchors and corners. Anchors specify the minimum and maximum offsets with parent's box, while
     * corners specify the offsets of element's corners from the anchors. This allows the elements to respond to screen size changes
     * in dynamic manner without any additional code.
     * The elements also have a notion of local transformation, which can be modified using standard methods, like rotateLocal and
     * translateLocal. When the local transform of an entity with an element is non-identity, it's always computed after anchors and
     * corners computation and happen around the pivot point – the point that lies within the current element (as opposed to anchors, 
     * which are in parent's coordinate system). This allows to perform rotations and other transformations around some specific point
     * of an element, for instance, lower right corner.
     * The elements can also have a module attached, i.e. text module, which allows to text output.
     * @param {pc.ElementComponentSystem} system The ComponentSystem that created this Component
     * @param {pc.Entity} entity The Entity this Component is attached to
     * @extends pc.Component
     * @property {String} type Type of the element extension to attach.
     * @property {pc.Vec4} corners Corner offsets from anchor points.
     * @property {Number} drawOrder Drawing priority of the element.
     * @property {Number} width Effective width of the element.
     * @property {Number} height Effective height of the element.
     * @property {Number} left Left side offset from left anchor line.
     * @property {Number} right Right side offset from right anchor line.
     * @property {Number} top Top side offset from top anchor line.
     * @property {Number} bottom Bottom side offset from bottom anchor line.
     * @property {pc.Vec2} pivot Pivot point location.
     * @property {pc.Vec4} anchor Anchor location.
     */

    var ElementComponent = function ElementComponent (system, entity) {
        pc.Component.call(this, system, entity);
        
        this._anchor = new pc.Vec4();
        this._localAnchor = new pc.Vec4();
        this._canvasGroups = [];

        this._pivot = new pc.Vec2(0.5, 0.5);
        this._width = 0;
        this._height = 0;

        // default stencil layer of the element
        this._stencilLayer = 255;
        this._masksChildren = false;

        // corner offsets in relation to anchors
        this._corners = new pc.Vec4(0, 0, 0, 0);
        //this._pivotGraph = new pc.Entity();
        //this._pivotGraph.isPivotGraphUntitledNode = true;

        this._anchoredPosition = new pc.Vec2(0, 0);
        this._sizeDelta = new pc.Vec2(0, 0);

        this._screenToWorld = new pc.Mat4();

        // the position of the element in canvas co-ordinate system. (0,0 = top left)
        this._canvasPosition = new pc.Vec2();

        this._anchorDirty = true;

        this.entity.on('insert', this._onInsert, this);

        this.screen = null;

        this._type = pc.ELEMENTTYPE_GROUP;

        this._fromPivotTransform = new pc.Mat4;
        this._toPivotTransform = new pc.Mat4;
        this._pivotPoint = new pc.Vec3;

        // element types
        this._image = null;
        this._text = null;
        this._group = null;
        this._elementRect = new pc.Vec4;

        if (!_warning) {
            console.warn("Message from PlayCanvas: The element component is currently in Beta. APIs may change without notice.");
            _warning = true;
        }
    };

    ElementComponent.prototype = Object.create(pc.Component.prototype);
    ElementComponent.prototype.constructor = ElementComponent;

    pc.extend(ElementComponent.prototype, {
        
        // Prepares stencil params for the inner components to be utilized during
        // rendering. To keep things the least obtrusive way, it assumes the default stencil
        // buffer value is 0, meaning the topmost mask (mind masking elements can be nested 
        // into each other) should fill the buffer with a const using GREATEREQUAL function,
        // while children should be drawn with smaller ref value and LESSEQUAL function.
        _getStencilParameters: function() {
            var func = pc.FUNC_ALWAYS;

            if (this._masked) {
                func = this._masksChildren ? pc.FUNC_LESSEQUAL : pc.FUNC_EQUAL;
            }

            return new pc.StencilParameters({
                func:  func,
                ref:   this._stencilLayer,
                mask:  0xFF,
                zfail: pc.STENCILOP_KEEP,
                zpass: pc.STENCILOP_REPLACE,
                fail:  this._masked ? pc.STENCILOP_KEEP : pc.STENCILOP_REPLACE
            });
        },
 
        _patch: function () {
            this.entity._dirtyLocal = true;
            
            this.entity._sync = this._sync;
            this.entity._presync = this._presync;
            this.entity.setPosition = this._setPosition;
        },

        _unpatch: function () {
            this.entity._sync = pc.Entity.prototype._sync;
            this.entity._presync = pc.Entity.prototype._presync;
            this.entity.setPosition = pc.Entity.prototype.setPosition;
        },

        _setPosition: function () {
            var position = new pc.Vec3();
            var localPosition = new pc.Vec3();
            var invParentWtm = new pc.Mat4();

            return function (x, y, z) {
                if (x instanceof pc.Vec3) {
                    position.copy(x);
                } else {
                    position.set(x, y, z);
                }

                this.getWorldTransform(); // ensure hierarchy is up to date
                invParentWtm.copy(this.element._screenToWorld).invert();
                invParentWtm.transformPoint(position, localPosition);

                if (!localPosition.equals(this.localPosition)) {
                    this.localPosition.copy( localPosition );
                    this._dirtyLocal = true;
                }
            };
        }(),

        _updateAnchoredPosition: function () {
            this._anchoredPosition.set(
                (1.0 - this._pivot.x) * this._corners.x + this._pivot.x * this._corners.z,
                (1.0 - this._pivot.y) * this._corners.y + this._pivot.y * this._corners.w
            );
        },

        _updateSizeDelta: function () {
            this._sizeDelta.set(
                this._corners.z - this._corners.x,
                this._corners.w - this._corners.y
            );
        },

        _presync: function () {
            var element = this.element;

            if ( this.element.screen ) {
                var camera = this.element.screen.screen.camera || pc.Application.getApplication().getMainCamera().camera;
                if ( camera._projMatDirty ) {
                    this.element.screen.screen._calcProjectionMatrix();
                }
            }

            if (!element._anchorDirty && !element._sizeDeltaDirty && !element._anchoredPositionDirty && !element._cornerDirty &&
                !this._dirtyLocal && !this._dirtyLocalEulerAngles && !this._dirtyWorld) {
                return;
            }

            pc.GraphNode.prototype._presync.apply( this );
        },

        _updateElementRect: function (container) {
            if (!container) {
                var parentElement = this._findParentElement();

                if (parentElement) {
                    container = parentElement.element;
                } else if (this.screen) {
                    container = this.screen.screen;
                }
            }
            
            if ( container ) {
                this._elementRect.set(
                    container._width  * this._anchor.x + this._corners.x,
                    container._height * this._anchor.y + this._corners.y,
                    container._width  * this._anchor.z + this._corners.z,
                    container._height * this._anchor.w + this._corners.w
                );
            }
        },

        // this method overwrites GraphNode#sync and so operates in scope of the Entity.
        _sync: function () {
            var element = this.element;

            if (!element._anchorDirty && !element._sizeDeltaDirty && !element._anchoredPositionDirty && !element._cornerDirty &&
                !this._dirtyLocal && !this._dirtyLocalEulerAngles && !this._dirtyWorld) {
                return;
            }

            // if got here it means the transform has been changed
            this.hasChanged = true;

            var parent = element._parent;

            if (this._dirtyLocalEulerAngles) {
                this.localRotation.setFromEulerAngles(this.localEulerAngles.x, this.localEulerAngles.y, this.localEulerAngles.z);
                this._dirtyLocal = true;
                this._dirtyLocalEulerAngles = false;
            }

            if (this._dirtyLocal) {
                this.localTransform.setTRS(this.localPosition, this.localRotation, this.localScale);

                this._dirtyLocal = false;
                this._dirtyWorld = true;
                this._aabbVer++;
            }

            if (element._anchoredPositionDirty) {
                var eapX = (1.0 - element._pivot.x) * element._corners.x + element._pivot.x * element._corners.z;
                var eapY = (1.0 - element._pivot.y) * element._corners.y + element._pivot.y * element._corners.w;

                element._corners.set(
                    element._corners.x + (element._anchoredPosition.x - eapX),
                    element._corners.y + (element._anchoredPosition.y - eapY),
                    element._corners.z + (element._anchoredPosition.x - eapX),
                    element._corners.w + (element._anchoredPosition.y - eapY)
                )

                element._anchoredPositionDirty = false;

                element._cornerDirty = true;
                this._dirtyWorld = true;

                this._aabbVer++;
            }

            if (element._sizeDeltaDirty) {
                element._corners.set(
                    element._anchoredPosition.x - element._pivot.x * element._sizeDelta.x,
                    element._anchoredPosition.y - element._pivot.y * element._sizeDelta.y,
                    element._anchoredPosition.x + (1 - element._pivot.x) * element._sizeDelta.x,
                    element._anchoredPosition.y + (1 - element._pivot.y) * element._sizeDelta.y
                )

                element._sizeDeltaDirty = false;

                element._cornerDirty = true;
                this._dirtyWorld = true;

                this._aabbVer++;
            }

            var screen = element.screen;
            var _parentWithElement = element._findParentElement();

            if (!_parentWithElement && !screen) {
                return;
            }

            var rect = element._elementRect;

            element._updateElementRect();
            element._updateAnchoredPosition();
            element._updateSizeDelta();

            for (var i = 0; i < this._layoutSelfControllers.length; i++) {
                var layoutController = this._layoutSelfControllers[ i ];
                if ( layoutController != null && layoutController.m_Enabled ) {
                    layoutController.SetLayoutHorizontal();
                    layoutController.SetLayoutVertical();
                }    
            }

            for (var i = 0; i < this._layoutControllers.length; i++) {
                var layoutController = this._layoutControllers[ i ];
                if ( layoutController != null && layoutController.m_Enabled ) {
                    layoutController.SetLayoutHorizontal();
                    layoutController.SetLayoutVertical();
                }    
            }

            for (var i = 0; i < this._aspectRatioFitters.length; i++) {
                var aspectRatioFitter = this._aspectRatioFitters[ i ];
                if (aspectRatioFitter != null) {
                    aspectRatioFitter.UpdateRect();
                }   
            }

            element._width = rect.z - rect.x;
            element._height = rect.w - rect.y;

            element._anchorDirty = false;
            element._cornerDirty = false;

            if ( this._dirtyWorld ) {
                // let's compute the pivot point – remember it's local to element coord space
                element._pivotPoint.set( element._width * element.pivot.x, element._height * element.pivot.y, 0 );
                _tmpVector.copy( element._pivotPoint );

                // check if we are in canvas-enabled element
                if ( this.screen && !this.screen._findParentScreen() ) {
                    // yes we do: in this case screen matrix is our base
                    this.worldTransform.copy( this.screen._screenMatrix );

                    if ( this.screen.screenType !== pc.SCREEN_TYPE_WORLD ) {
                        // only overlay canvases drive their RectTransform's size
                        element._width = this.screen._width;
                        element._height = this.screen._height;
                        element._sizeDelta.set( element._width, element._height );
                        element._elementRect.set( 0, 0, element._width, element._height );
                        element._corners.set( -element._width, -element._height, element._width, element._height ).scale( 0.5 );
                    }

                    // make sure pivot point is still correct
                    element._pivotPoint.set( element._width * 0.5, element._height * 0.5, 0 );

                    // reset rect (it's driven by screen and scale)
                    rect.x = rect.y = 0;

                    if ( this.screen.screenType === pc.SCREEN_TYPE_SCREEN ) {
                        // screen-space origin is at bottom left corner
                        _tmpVector.set( element._width, element._height, 0 ).scale( 0.5 * this.screen.scale );

                        // update the scale of the entity to match screen-scale
                        this.localScale.set( this.screen.scale, this.screen.scale, this.screen.scale );
                    }

                    if ( this.screen.screenType === pc.SCREEN_TYPE_CAMERA ) {
                        var camera = this.screen.camera._component.entity;

                        // start with camera's transform
                        this.worldTransform.copy( camera.getWorldTransform() );

                        // move away to place distance
                        _tmpMatrix.setTranslate( 0, 0, this.screen._screenDistance );

                        // screen-space origin is at bottom left corner
                        _tmpVector.set( 0, 0, 0 );

                        // add it up to the world transform
                        this.worldTransform.mul( _tmpMatrix );

                        // we don't need local rotation (and cannot set it as all these values are driven by canvas)
                        this.localRotation.copy( pc.Quat.IDENTITY );

                        // update the scale of the entity: it has to squeeze all pixels into camera's world-space
                        // view-port (which is pre-computed based on projection matrix in screen component)
                        this.localScale.set( 1, 1, 1 ).scale( this.screen._planeHeight / element._height );
                    }

                    if ( this.screen.screenType === pc.SCREEN_TYPE_WORLD ) {
                        // world-space, as usual, is the easiest
                        this.worldTransform.copy( this._parent.worldTransform );
                        _tmpVector.copy( this.localPosition );
                    }
                } else {
                    // no, we are just a normal child. in this case, we need to get back to paren't origin (
                    // as worldTransform leaves us at pivot)
                    if ( this._parent !== null ) {
                        // start off with parent's transform
                        this.worldTransform.copy( this._parent.worldTransform );

                        // and check if we need to account pivot back
                        if ( this._parent.element ) {
                            var pivot = this._parent.element._pivotPoint;

                            _tmpMatrix.setTranslate( -pivot.x, -pivot.y, 0 );
                            this.worldTransform.mul( _tmpMatrix );
                        }
                    } else {
                        // well, easy: just identity
                        this.worldTransform.setIdentity();    
                    }
                }

                // now, let's find the transform for our origin point: our bottom left corner
                _tmpMatrix.setTranslate( rect.x, rect.y, 0 );

                // add it up to the world transform
                this.worldTransform.mul( _tmpMatrix );

                // now, let's apply transforms (rotations and scale) relative to pivot
                _tmpMatrix.setTRS( _tmpVector, this.localRotation, this.localScale );

                // add it up to the world transform
                this.worldTransform.mul( _tmpMatrix );

                // pre-calc inverse transform: we need it for raycasts
                this.worldTransformInverse.copy( this.worldTransform ).invert();

                // we are done! please note worldTransform's origin now sits at pivot point
                // rendering and layout has to account it!
                this._dirtyWorld = false;

                var child;

                for (var i = 0, len = this._children.length; i < len; i++) {
                    child = this._children[i];
                    child._dirtifyWorld();
                    child._aabbVer++;
                }

                element.fire("resize", element._width, element._height);

                for (var i = 0; i < this._canvasElements.length; i++) {
                    var canvasElement = this._canvasElements[ i ];

                    if ( canvasElement != null ) {
                        canvasElement.Rebuild( 2 );
                        canvasElement.Rebuild( 3 );
                    }
                }
            }
        },

        propagateDirty: function() {
            var nodes = [];
            
            var node = this.entity;
            var target = this.entity;
            
            while ( node ) {
                if ( node._layoutControllers.length > 0 ) {
                    target = node;
                }

                node = node._parent;
            }

            target._dirtifyWorld();
        },

        setVerticesDirty: function () {
            if (this._image) {
                this._image.setVerticesDirty();
            }

            if (this._text) {
                this._text.setVerticesDirty();
            }
        },

        _onInsert: function (parent) {
            // when the entity is reparented find a possible new screen
            var screen = this._findScreen();
            this._updateScreen(screen);

            this.propagateDirty();

            if (screen) {
                screen.screen._updateStencilParameters();
            }

            this._canvasGroups = this._collectCanvasGroups();
        },

        _updateScreen: function (screen, skipOrderUpdate) {
            if (this.screen && this.screen !== screen) {
                this.screen.screen.off('set:resolution', this._onScreenResize, this);
                this.screen.screen.off('set:referenceresolution', this._onScreenResize, this);
                this.screen.screen.off('set:scaleblend', this._onScreenResize, this);
                this.screen.screen.off('set:screentype', this._onScreenTypeChange, this);
            }

            this.screen = this._findScreen();

            if (this.screen) {
                this.screen.screen.on('set:resolution', this._onScreenResize, this);
                this.screen.screen.on('set:referenceresolution', this._onScreenResize, this);
                this.screen.screen.on('set:scaleblend', this._onScreenResize, this);
                this.screen.screen.on('set:screentype', this._onScreenTypeChange, this);

                this._patch();
            } else {
                this._unpatch();
            }

            this.fire('set:screen', this.screen);

            this._anchorDirty = true;
            this.entity._dirtyWorld = true;

            // update all child screens
            var children = this.entity.getChildren();
            for (var i = 0, l = children.length; i < l; i++) {
                if (children[i].element) {
                    children[i].element._updateScreen(screen, skipOrderUpdate);
                } else {
                    this._updateScreenForNonElement(children[i], screen, skipOrderUpdate);
                }
            }

            // calculate draw order
            if (this.screen && !skipOrderUpdate) {
                this.screen.screen.syncDrawOrder();
            }
        },

        _updateScreenForNonElement: function (nonelement, screen, skipOrderUpdate) {
            var children = nonelement.getChildren();
            for (var i = 0, l = children.length; i < l; i++) {
                if (children[i].element) {
                    children[i].element._updateScreen(screen, skipOrderUpdate);
                } else {
                    this._updateScreenForNonElement(children[i], screen, skipOrderUpdate);
                }
            }
        },

        _findScreen: function () {
            var node = this.entity;
            var screen = this.screen;

            this._nearestScreen = null;

            while (node) {
                this._nearestScreen = this._nearestScreen || node.screen;
                
                screen = node.screen || screen;
                node = node._parent;
            }

            return screen ? screen.entity : null;
        },

        _findParentElement: function () {
            var node = this.entity._parent;

            while (node && !node.element) {
                node = node._parent;
            }

            return node;
        },

        _onScreenResize: function (res) {
            this.entity._dirtyWorld = true;
            this._anchorDirty = true;

            this.fire('screen:set:resolution', res);
        },

        _onScreenTypeChange: function () {
            this.entity._dirtyWorld = true;
            this.fire('screen:set:screentype', this.screen.screen.screenType);
        },

        _collectCanvasGroups: function () {
            var node = this.entity._parent;

            while (node && !node.element) {
                node = node._parent;
            }

            if (!node) {
                return this.entity._canvasGroups;
            }

            if (node.element._canvasGroups == null) {
                node.element._canvasGroups = node.element._collectCanvasGroups();
            }

            return node.element._canvasGroups.concat( this.entity._canvasGroups );
        },

        notifyCanvasGroupChanged: function () {
            var f = function (root) {
                if (root.element) {
                    root.element._canvasGroups = root.element._collectCanvasGroups()
                }

                for(var i = 0; i < root._children.length; i++) {
                    f( root._children[ i ] )
                }
            };

            f( this.entity );
        },

        onEnable: function () {
            pc.Component.prototype.onEnable.call(this);
            if (this._image) this._image.onEnable();
            if (this._text) this._text.onEnable();
            if (this._group) this._group.onEnable();
            this.propagateDirty();
        },

        onDisable: function () {
            pc.Component.prototype.onDisable.call(this);
            if (this._image) this._image.onDisable();
            if (this._text) this._text.onDisable();
            if (this._group) this._group.onDisable();
            this.propagateDirty();
        },

        onRemove: function () {
            this._unpatch();
            if (this._image) this._image.destroy();
            if (this._text) this._text.destroy();
            this.propagateDirty();
        }
    });

    /**
    * @name pc.ElementComponent#type
    * @type pc.Color
    * @description The type of the extension attached to the element. Allowed values are pc.ELEMENTTYPE_GROUP,
    * pc.ELEMENTTYPE_TEXT and pc.ELEMENTTYPE_IMAGE.
    */
    Object.defineProperty(ElementComponent.prototype, "type", {
        get: function () {
            return this._type;
        },

        set: function (value) {
            if (value !== this._type) {
                this._type = value;

                if (this._image) {
                    this._image.destroy();
                    this._image = null;
                }
                if (this._text) {
                    this._text.destroy();
                    this._text = null;
                }

                if (value === pc.ELEMENTTYPE_IMAGE) {
                    this._image = new pc.ImageElement(this);
                } else if (value === pc.ELEMENTTYPE_TEXT) {
                    this._text = new pc.TextElement(this);
                }

            }
        }
    });

    /**
    * @name pc.ElementComponent#corners
    * @type pc.Vec4
    * @description The corners of the component set in a form of {@link pc.Vec4} with coords meaning offsets from:
    * left anchor, bottom anchor, right anchor, top anchor
    * @example
    * // make element occupy central quarter of the parent with an inner padding of 10 px (or units, depending on screen 
    * // overlay flag)
    * var element = this.entity.element;
    * element.anchors = new pc.Vec4( 0.25, 0.75, 0.75, 0.25 );
    * element.corners = new pc.Vec4( 10, 10, -10, -10 );
    */
    Object.defineProperty(ElementComponent.prototype, "corners", {
        get: function () {
            return this._corners;
        },

        set: function (value) {
            this._corners = value;
            this._cornerDirty = true;

            this._updateAnchoredPosition();
            this._updateSizeDelta();

            this.entity._dirtyWorld = true;
        }
    });

    /**
    * @name pc.ElementComponent#drawOrder
    * @type Number
    * @description Drawing priority of the element.
    */
    Object.defineProperty(ElementComponent.prototype, "drawOrder", {
        get: function () {
            return this._drawOrder;
        },

        set: function (value) {
            this._drawOrder = value;
            this.fire('set:draworder', this._drawOrder);
        }
    });

    /**
    * @readonly
    * @name pc.ElementComponent#width
    * @type Number
    * @description Effective width of the element
    */
    Object.defineProperty(ElementComponent.prototype, "width", {
        get: function () {
            return this._width;
        }
    });

    /**
    * @readonly
    * @name pc.ElementComponent#height
    * @type Number
    * @description Effective height of the element
    */
    Object.defineProperty(ElementComponent.prototype, "height", {
        get: function () {
            return this._height;
        }
    });

    /**
    * @name pc.ElementComponent#left
    * @type Number
    * @description The left side offset from left anchor line.
    */
    Object.defineProperty(ElementComponent.prototype, "left", {
        get: function () {
            return this._corners.x;
        },

        set: function (value) {
            this._corners.x = value;
            this._cornerDirty = true;

            this._updateAnchoredPosition();
            this._updateSizeDelta();

            this.entity.getWorldTransform();
        }
    });

    /**
    * @name pc.ElementComponent#right
    * @type Number
    * @description The right side offset from right anchor line.
    */
    Object.defineProperty(ElementComponent.prototype, "right", {
        get: function () {
            return this._corners.z;
        },

        set: function (value) {
            this._corners.z = value;
            this._cornerDirty = true;

            this._updateAnchoredPosition();
            this._updateSizeDelta();

            this.entity.getWorldTransform();
        }
    });

    /**
    * @name pc.ElementComponent#top
    * @type Number
    * @description The top side offset from top anchor line.
    */
    Object.defineProperty(ElementComponent.prototype, "top", {
        get: function () {
            return this._corners.w;
        },

        set: function (value) {
            this._corners.w = value;
            this._cornerDirty = true;

            this._updateAnchoredPosition();
            this._updateSizeDelta();

            this.entity.getWorldTransform();
        }
    });

    /**
    * @name pc.ElementComponent#bottom
    * @type Number
    * @description The bottom side offset from bottom anchor line.
    */
    Object.defineProperty(ElementComponent.prototype, "bottom", {
        get: function () {
            return this._corners.y;
        },

        set: function (value) {
            this._corners.y = value;
            this._cornerDirty = true;

            this._updateAnchoredPosition();
            this._updateSizeDelta();

            this.entity.getWorldTransform();
        }
    });

    /**
    * @name pc.ElementComponent#pivot
    * @type pc.Vec2
    * @description The location of the pivot point within the element, x and y being fractions of
    * width and height respectively.
    * @example
    * // rotate an element around lower left corner
    * var element = entity.element;
    * element.pivot = new pc.Vec2( 0, 0 );
    * entity.setLocalEulerAngles(0, 0, 30);
    */
    Object.defineProperty(ElementComponent.prototype, "pivot", {
        get: function () {
            return this._pivot;
        },

        set: function (value) {
            if (value instanceof pc.Vec2) {
                this._pivot.set(value.x, value.y);
            } else {
                this._pivot.set(value[0], value[1]);
            }

            this._updateAnchoredPosition();
            this._updateSizeDelta();

            this._onScreenResize();
            this.fire('set:pivot', this._pivot);
        }
    });

    /**
    * @name pc.ElementComponent#anchor
    * @type pc.Vec4
    * @description The anchor points of the element in the coordinate system of a parent. The anchors set the fraction
    * of respective parent's dimension in the form of {@link pc.Vec4} in the following order:
    * left anchor, bottom anchor, right anchor, top anchor
    * @example
    * // make element occupy central quarter of the parent
    * var element = this.entity.element;
    * element.anchors = new pc.Vec4( 0.25, 0.75, 0.75, 0.25 );
    */
    Object.defineProperty(ElementComponent.prototype, "anchor", {
        get: function () {
            return this._anchor;
        },

        set: function (value) {
            if (value instanceof pc.Vec4) {
                this._anchor.set(value.x, value.y, value.z, value.w);
            } else {
                this._anchor.set(value[0], value[1], value[2], value[3]);
            }

            this._updateAnchoredPosition();
            this._updateSizeDelta();
            this._updateElementRect();

            this._anchorDirty = true;
            this.entity._dirtyWorld = true;
            this.fire('set:anchor', this._anchor);
        }
    });

    Object.defineProperty(ElementComponent.prototype, "anchoredPosition", {
        get: function () {
            return this._anchoredPosition;
        },

        set: function (value) {
            this._anchoredPosition.set( value.x, value.y );

            var eapX = (1.0 - this._pivot.x) * this._corners.x + this._pivot.x * this._corners.z;
            var eapY = (1.0 - this._pivot.y) * this._corners.y + this._pivot.y * this._corners.w;

            if ((Math.abs(eapX - this._anchoredPosition.x) + Math.abs(eapY - this._anchoredPosition.y)) < 0.01) {
                return;
            }

            this._corners.set(
                this._corners.x + (this._anchoredPosition.x - eapX),
                this._corners.y + (this._anchoredPosition.y - eapY),
                this._corners.z + (this._anchoredPosition.x - eapX),
                this._corners.w + (this._anchoredPosition.y - eapY)
            );

            this._updateElementRect();

            this.entity._dirtyWorld = true;
            this._cornerDirty = true;
        }
    });

    Object.defineProperty(ElementComponent.prototype, "sizeDelta", {
        get: function () {
            return this._sizeDelta;
        },

        set: function (value) {
            this._sizeDelta.set( value.x, value.y );

            var esdX = this._corners.z - this._corners.x;
            var esdY = this._corners.w - this._corners.y;

            if ( (Math.abs(esdX - this._sizeDelta.x) + Math.abs(esdY - this._sizeDelta.y)) < 0.01 ) {
                return;
            }

            this._corners.set(
                this._anchoredPosition.x - this._pivot.x * this._sizeDelta.x,
                this._anchoredPosition.y - this._pivot.y * this._sizeDelta.y,
                this._anchoredPosition.x + (1 - this._pivot.x) * this._sizeDelta.x,
                this._anchoredPosition.y + (1 - this._pivot.y) * this._sizeDelta.y
            )

            this._updateElementRect();

            this.entity._dirtyWorld = true;
            this._cornerDirty = true;
        }
    });

    var _define = function (name) {
        Object.defineProperty(ElementComponent.prototype, name, {
            get: function () {
                if (this._text) {
                    return this._text[name];
                } else if (this._image) {
                    return this._image[name];
                } else {
                    return null;
                }
            },
            set: function (value) {
                if (this._text) {
                    this._text[name] = value;
                } else if (this._image) {
                    this._image[name] = value;
                }
            }
        })
    };

    _define("fontSize");
    _define("color");
    _define("font");
    _define("fontAsset");
    _define("spacing");
    _define("lineHeight");
    _define("align");
    _define("verticalAlign");

    _define("text");
    _define("texture");
    _define("textureAsset");
    _define("material");
    _define("materialAsset");
    _define("opacity");
    _define("rect");
    _define("masksChildren");
    _define("alphaTest");
    _define("border");

    return {
        ElementComponent: ElementComponent
    };
}());

//**** Events Documentation *****//

/**
* @event
* @name pc.POINTEREVER_DOWN
* @description Fired when a mouse button or a figner presses the element.
* @param {pc.Vec3} point The coordinate of the cursor or finger in local coordinate space of the element.
*/

/**
* @event
* @name pc.POINTEREVER_UP
* @description Fired when a mouse button or a figner releases the element.
* @param {pc.Vec3} point The coordinate of the cursor or finger in local coordinate space of the element.
*/

/**
* @event
* @name pc.POINTEREVER_MOVE
* @description Fired when a mouse or a figner moves within the element.
* @param {pc.Vec3} point The coordinate of the cursor or finger in local coordinate space of the element.
*/

/**
* @event
* @name pc.POINTEREVER_ENTER
* @description Fired when a mouse or a figner enters the element.
* @param {pc.Vec3} point The coordinate of the cursor or finger in local coordinate space of the element.
*/

/**
* @event
* @name pc.POINTEREVER_LEAVE
* @description Fired when a mouse or a figner leave the element.
* @param {pc.Vec3} point The coordinate of the cursor or finger in screen coordinate space.
*/

/**
* @event
* @name pc.POINTEREVER_SCROLL
* @description Fired when a mouse wheel is scrolled with the element.
* @param {pc.Vec3} point The coordinate of the cursor or finger in local coordinate space.
* @param {Number} amount The amount of the scroll.
*/
