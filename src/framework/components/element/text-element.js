pc.extend(pc, function () {

    /**
     * @name pc.TextElement
     * @description Attaches text extension to an element.
     * @class This extension makes an element render text string using SDF texture. The extension exposes the properties
     * for controlling text alignment within the element's bounds, as well as color settings.
     * @param {pc.ElementComponent} element The ElementComponent to attach image extension to.
     * @property {String} text The string of text to render. It can include '\n' chars which would make the text wrap to the next line.
     * @property {pc.Color} color The color to tint the text with.
     * @property {Number} opacity Opacity multiplier for the text.
     * @property {Number} lineHeight Line height of the text.
     * @property {Number} spacing Spacing multiplier for the text.
     * @property {String} align The horizontal aligntment of the text in relation to element's bounds.
     * <ul>
     * <li>{@link pc.TEXT_ALIGN_LEFT}: Align to the left side.</li>
     * <li>{@link pc.TEXT_ALIGN_CENTER}: Center the text.</li>
     * <li>{@link pc.TEXT_ALIGN_RIGHT}: Align to the right side.</li>
     * </ul>
     * @property {String} verticalAlign The vertical aligntment of the text in relation to element's bounds.
     * <ul>
     * <li>{@link pc.TEXT_ALIGN_TOP}: Align to the top side.</li>
     * <li>{@link pc.TEXT_ALIGN_MIDDLE}: Center the text.</li>
     * <li>{@link pc.TEXT_ALIGN_BOTTOM}: Align to the bottom side.</li>
     * </ul>
     * @property {Number} fontSize The size of the letters to render.
     * @property {pc.Asset} fontAsset The asset to gather the font from.
     * @property {pc.Font} font The font to use for rendering.
     */  

    var TextElement = function TextElement (element) {
        this._element = element;
        this._system = element.system;
        //this._entity = element.entity;
        this._entity = element._pivotGraph;

        // public
        this._text = "";
        this._enabled = true;

        this._align = pc.TEXT_ALIGN_CENTER;
        this._veticalAlign = pc.TEXT_VERTICAL_ALIGN_MIDDLE;

        this._fontAsset = null;
        this._font = null;

        this._color = new pc.Color(1,1,1,1);

        this._spacing = 1;
        this._fontSize = 32;
        this._lineHeight = 1;
        this._bestFit = false;
        this._minFontSize = 0;
        this._maxFontSize = 1000;

        this.width = 0;
        this.height = 0;

        this._textMaterial = this._system.defaultTextMaterial;

        // private
        this._node = new pc.GraphNode();
        this._model = null;
        this._mesh = null;
        this._meshInstance = null;
        this._material = null;

        this._positions = [];
        this._normals = [];
        this._uvs = [];
        this._indices = [];
        this._spacings = new pc.Vec4(0, 0, 0, 0);

        this._noResize = false; // flag used to disable resizing events

        // initialize based on screen
        this._onScreenChange(this._element.screen);

        // start listening for element events
        element.on('resize', this._onParentResize, this);
        element.on('set:screen', this._onScreenChange, this);
        element.on('screen:set:screentype', this._onScreenTypeChange, this);
        element.on('set:draworder', this._onDrawOrderChange, this);
        element.on('set:stencillayer', this._onStencilLayerChange, this);
    };

    pc.extend(TextElement.prototype, {
        destroy: function () {
            if (this._model) {
                this._system.app.scene.removeModel(this._model);
                this._model.destroy();
                this._model = null;
            }

            this._element.off('resize', this._onParentResize, this);
            this._element.off('set:screen', this._onScreenChange, this);
            this._element.off('screen:set:screentype', this._onScreenTypeChange, this);
            this._element.off('set:draworder', this._onDrawOrderChange, this);
            this._element.off('set:stencillayer', this._onStencilLayerChange, this);
        },

        _onParentResize: function (width, height) {
            if (this._noResize) return;
            if (this._font) this._updateText(this._text);
        },

        _onStencilLayerChange: function(value) {
            if (this._meshInstance) {
                var stencil = this._element._getStencilParameters();
                this._meshInstance.stencilBack = stencil;
                this._meshInstance.stencilFront = stencil;
            }
        },

        _onScreenChange: function (screen) {
            if (screen) {
                this._updateMaterial(screen.screen.screenType == pc.SCREEN_TYPE_SCREEN);
            } else {
                this._updateMaterial(false);
            }
        },

        _onScreenTypeChange: function (value) {
            this._updateMaterial(value == pc.SCREEN_TYPE_SCREEN);
        },

        _onDrawOrderChange: function (order) {
            this._drawOrder = order;

            if (this._meshInstance) {
                this._meshInstance.drawOrder = order;
            }

            this._setLayerFromScreen();
        },

        _onPreRender: function () {
        },

        _updateText: function (text) {
            if (!this._font) {
                return;
            }

            if (text === undefined) text = this._text;

            if (!this._mesh || text.length !== this._text.length) {

                if (this._mesh) {
                    // remove model from scene
                    this._system.app.scene.removeModel(this._model);

                    // destroy old mesh
                    this._mesh.vertexBuffer.destroy();
                    for (var i = 0; i < this._mesh.indexBuffer.length; i++) {
                        this._mesh.indexBuffer[i].destroy()
                    }

                    this._model = null;
                    this._mesh = null;
                    this._meshInstance = null;
                }

                var screenSpace = (this._element.screen && this._element.screen.screen.screenType == pc.SCREEN_TYPE_SCREEN);

                this._updateMaterial(screenSpace);

                this._mesh = this._createMesh(text);

                if (this._node.getParent()) {
                    this._node.getParent().removeChild(this._node);
                }

                this._model = new pc.Model();
                this._model.graph = this._node;

                this._meshInstance = new pc.MeshInstance(this._node, this._mesh, this._material);
                this._meshInstance.preRender = this;
                this._onStencilLayerChange();

                this._model.meshInstances.push(this._meshInstance);

                this._meshInstance.drawOrder = this._drawOrder;
                if (screenSpace) {
                    this._meshInstance.layer = pc.scene.LAYER_HUD;
                }
                this._meshInstance.screenSpace = screenSpace;
                this._meshInstance.setParameter("texture_msdfMap", this._font.texture);
                this._meshInstance.setParameter("sdfEnabled", this._font.data.info.bitmapFont ? 0 : 1);
                this._meshInstance.setParameter("material_emissive", this._color.data3);
                this._meshInstance.setParameter("material_opacity", this._color.data[3]);

                // add model to sceen
                if (this._entity.enabled) {
                    this._system.app.scene.addModel(this._model);
                }
                this._entity.addChild(this._model.graph);
                this._model._entity = this._entity;

                this._updateAligns();
            } else {
                this._updateMesh(this._mesh, text);
                this._meshInstance.setParameter("texture_msdfMap", this._font.texture);
                this._meshInstance.setParameter("sdfEnabled", this._font.data.info.bitmapFont ? 0 : 1);
            }

            this._setLayerFromScreen();
        },

        _updateAligns: function() {
            var scale = 1.0;

            if (this._bestFit) {
                var xScale = this._element.width / this.width;
                var yScale = this._element.width / this.width;

                var minScale = this._minFontSize / this._fontSize;
                var maxScale = this._maxFontSize / this._fontSize;

                scale = Math.min( xScale, yScale );
                scale = Math.min( maxScale, Math.max( minScale, scale ) );

                this._node.setLocalScale(scale, scale, scale);
            }

            var wd = this._element.width - this.width * scale;
            var hd = this._element.height - this.height * scale;

            if (this._align == pc.TEXT_ALIGN_CENTER) {
                wd *= 0.5;
            }

            if (this._align == pc.TEXT_ALIGN_LEFT) {
                wd *= 0;
            }

            if (this._veticalAlign == pc.TEXT_VERTICAL_ALIGN_MIDDLE) {
                hd *= 0.5;
            }

            if (this._veticalAlign == pc.TEXT_VERTICAL_ALIGN_BOTTOM) {
                hd *= 0;
            }

            if (!this._mesh) {
                return;
            }

            var bottomLeftCorner = pc.Vec3.ZERO.clone();// this._mesh.aabb.getMin().scale(scale);
            bottomLeftCorner.x += this._spacings.x * scale;
            bottomLeftCorner.y += this._spacings.w * scale;

            //this._node.setLocalPosition( new pc.Vec3( wd, hd, 0 ).sub(bottomLeftCorner) );
        },

        _setLayerFromScreen: function () {
            if (!this._meshInstance) {
                return;
            }
            
            if (this._element.screen) {
                this._meshInstance.sortingLayerIndex = this._element._nearestScreen.sortingLayerIndex + 100;
                this._meshInstance.sortingOrder = this._element._nearestScreen.sortingOrder;
                this._meshInstance._nearestScreen = this._element._nearestScreen;

                // if (this._element.screen.screenType != pc.SCREEN_TYPE_WORLD) {
                //     this._meshInstance.sortingLayerIndex += 100;
                // }
            }

            this._meshInstance.drawOrder = this._drawOrder;
        },

        _updateMaterial: function (screenSpace) {
            this._material = this._textMaterial;

            if (this._meshInstance) {
                this._meshInstance.material = this._material;
                this._meshInstance.screenSpace = screenSpace;
                this._meshInstance.setParameter("screenSpaceFactor", screenSpace ? 1 : 0);
            }

            this._onStencilLayerChange();
            this._setLayerFromScreen();
        },

        // build the mesh for the text
        _createMesh: function (text) {
            var l = text.length;

            // handle null string
            if (l === 0) {
                l = 1;
                text = " ";
            }

            // create empty arrays
            this._positions = new Array(l*3*4);
            this._normals = new Array(l*3*4);
            this._uvs = new Array(l*2*4);
            this._indices = new Array(l*3*2);

            // create index buffer now
            // index buffer doesn't change as long as text length stays the same
            for (var i = 0; i < l; i++) {
                this._indices.push((i*4), (i*4)+1, (i*4)+3);
                this._indices.push((i*4)+2, (i*4)+3, (i*4)+1);
            };

            var mesh = pc.createMesh(this._system.app.graphicsDevice, this._positions, {uvs: this._uvs, normals: this._normals, indices: this._indices});
            this._updateMesh(mesh, text);
            return mesh;
        },

        _updateMesh: function (mesh, text) {
            var json = this._font.data;
            var vb = mesh.vertexBuffer;
            var it = new pc.VertexIterator(vb);

            var width = 0;
            var height = 0;

            var l = text.length;
            var _x = 0; // cursors
            var _y = 0;
            var _z = 0;
            var lines = 0;

            this._positions.length = 0;
            this._normals.length = 0;
            this._uvs.length = 0;
            this._lines = [[]];

            var miny = Number.MAX_VALUE;
            var maxy = Number.MIN_VALUE;

            var lastWordIndex = 0;
            var lastSoftBreak = 0;

            for (var i = 0; i < l; i++) {
                var char = text.charCodeAt(i);

                if (char === 10 || char === 13) {
                    // add forced line-break
                    _y -= this._lineHeight;
                    _x = 0;
                    lastWordIndex = i;
                    lastSoftBreak = i;
                    lines++;

                    this._lines.push([]);

                    continue;
                }

                this._lines[ this._lines.length - 1 ].push( i );

                if (char === 32) {
                    // space
                    lastWordIndex = i+1;
                }

                var x = 0;
                var y = 0;
                var advance = 0;
                var scale = 1;

                var data = json.chars[char];
                if (data && data.scale) {
                    scale = this._fontSize / data.scale;
                    advance = this._fontSize * data.xadvance / data.width;
                    x = this._fontSize * data.xoffset / data.width;
                    y = this._fontSize * data.yoffset / data.height;
                } else {
                    // missing character
                    advance = 0.5;
                    x = 0;
                    y = 0;
                    scale = this._fontSize;
                }

                this._positions[i*4*3+0] = _x - x;
                this._positions[i*4*3+1] = _y - y;
                this._positions[i*4*3+2] = _z;

                this._positions[i*4*3+3] = _x - (x - scale);
                this._positions[i*4*3+4] = _y - y;
                this._positions[i*4*3+5] = _z;

                this._positions[i*4*3+6] = _x - (x - scale);
                this._positions[i*4*3+7] = _y - y + scale;
                this._positions[i*4*3+8] = _z;

                this._positions[i*4*3+9]  = _x - x;
                this._positions[i*4*3+10] = _y - y + scale;
                this._positions[i*4*3+11] = _z;

                if (this._positions[i*4*3+7] > maxy) maxy = this._positions[i*4*3+7];
                if (this._positions[i*4*3+1] < miny) miny = this._positions[i*4*3+1];

                // advance cursor
                _x = _x + (this._spacing*advance);

                this._normals[i*4*3+0] = 0;
                this._normals[i*4*3+1] = 0;
                this._normals[i*4*3+2] = -1;

                this._normals[i*4*3+3] = 0;
                this._normals[i*4*3+4] = 0;
                this._normals[i*4*3+5] = -1;

                this._normals[i*4*3+6] = 0;
                this._normals[i*4*3+7] = 0;
                this._normals[i*4*3+8] = -1;

                this._normals[i*4*3+9] = 0;
                this._normals[i*4*3+10] = 0;
                this._normals[i*4*3+11] = -1;

                var uv = this._getUv(char);

                this._uvs[i*4*2+0] = uv[0];
                this._uvs[i*4*2+1] = uv[1];

                this._uvs[i*4*2+2] = uv[2];
                this._uvs[i*4*2+3] = uv[1];

                this._uvs[i*4*2+4] = uv[2];
                this._uvs[i*4*2+5] = uv[3];

                this._uvs[i*4*2+6] = uv[0];
                this._uvs[i*4*2+7] = uv[3];

                this._indices.push((i*4), (i*4)+1, (i*4)+3);
                this._indices.push((i*4)+2, (i*4)+3, (i*4)+1);
            }

            for(var lineIndex = 0; lineIndex < this._lines.length; lineIndex++) {
                var lineIndices = this._lines[ lineIndex ];

                if (lineIndices.length == 0) {
                    continue;
                }

                var leftIndex   = lineIndices[0] * 4 * 3;
                var rightIndex  = lineIndices[ lineIndices.length - 1 ] * 4 * 3 + 9;
                width           = this._positions[ rightIndex ] - this._positions[ leftIndex ];
                var wd          = this._element.width - width;

                if (this._align == pc.TEXT_ALIGN_CENTER) {
                    wd *= 0.5;
                }

                if (this._align == pc.TEXT_ALIGN_LEFT) {
                    wd *= 0;
                }

                for(var idx = 0; idx < lineIndices.length; idx++) {
                    var i = lineIndices[ idx ];

                    this._positions[i * 4 * 3 + 0] += wd;
                    this._positions[i * 4 * 3 + 3] += wd;
                    this._positions[i * 4 * 3 + 6] += wd;
                    this._positions[i * 4 * 3 + 9] += wd;
                }
            }

            // update width/height of element
            this._noResize = true;
            this._noResize = false;

            // update vertex buffer
            var numVertices = l*4;
            for (var i = 0; i < numVertices; i++) {
                it.element[pc.SEMANTIC_POSITION].set(this._positions[i*3+0], this._positions[i*3+1], this._positions[i*3+2]);
                it.element[pc.SEMANTIC_NORMAL].set(this._normals[i*3+0], this._normals[i*3+1], this._normals[i*3+2]);
                it.element[pc.SEMANTIC_TEXCOORD0].set(this._uvs[i*2+0], this._uvs[i*2+1]);

                it.next();
            }
            it.end();

            mesh.aabb.compute(this._positions);

            this.width = mesh.aabb.halfExtents.x * 2;
            this.height = mesh.aabb.halfExtents.y * 2;

            this._updateAligns();
        },

        _onFontAdded: function (asset) {
            this._system.app.assets.off('add:' + asset.id, this._onFontAdded, this);

            if (asset.id === this._fontAsset) {
                this._bindFont(asset);
            }
        },

        _bindFont: function (asset) {
            asset.on("load", this._onFontLoad, this);
            asset.on("change", this._onFontChange, this);
            asset.on("remove", this._onFontRemove, this);

            if (asset.resource) {
                this._onFontLoad(asset);
            } else {
                this._system.app.assets.load(asset);
            }
        },

        _onFontLoad: function (asset) {
            if (this.font !== asset.resource) {
                this.font = asset.resource;
            }
        },

        _onFontChange: function (asset) {

        },

        _onFontRemove: function (asset) {

        },

        _getUv: function (char) {
            var data = this._font.data;
            var width = data.info.width;
            var height = data.info.height;

            if (!data.chars[char]) {
                // missing char
                return [0,0,1,1]
            }

            var x = data.chars[char].x;
            var y =  data.chars[char].y;

            var x1 = x;
            var y1 = y;
            var x2 = (x + data.chars[char].width);
            var y2 = (y - data.chars[char].height);
            var edge = 1 - (data.chars[char].height / height)
            return [
                x1 / width,
                edge - (y1 / height), // bottom left

                (x2 / width),
                edge - (y2 / height)  // top right
            ];
        },

        onEnable: function () {
            if (this._model && !this._system.app.scene.containsModel(this._model)) {
                this._system.app.scene.addModel(this._model);
            }
        },

        onDisable: function () {
            if (this._model && this._system.app.scene.containsModel(this._model)) {
                this._system.app.scene.removeModel(this._model);
            }
        }
    });

    Object.defineProperty(TextElement.prototype, "text", {
        get: function () {
            return this._text
        },

        set: function (value) {
            var str = value.toString();

            if (this._text == str) {
                return;
            }

            if (this._font) {
                this._updateText(str);
            }
            this._text = str;

        }
    });

    /**
    * @name pc.TextElement#color
    * @type pc.Color
    * @description The color to multiply the text pixels by.
    * @example
    * // make text be red.
    * var element = this.entity.element;
    * element.color = new pc.Color( 1, 0, 0 );
    */
    Object.defineProperty(TextElement.prototype, "color", {
        get: function () {
            return this._color;
        },

        set: function (value) {
            this._color.data[0] = value.data[0];
            this._color.data[1] = value.data[1];
            this._color.data[2] = value.data[2];

            if (this._meshInstance) {
                this._meshInstance.setParameter('material_emissive', this._color.data3);
            }
        }
    });

    /**
    * @name pc.TextElement#opacity
    * @type Number
    * @description The alpha multiplier for the text material.
    */
    Object.defineProperty(TextElement.prototype, "opacity", {
        get: function () {
            return this._color.data[3];
        },

        set: function (value) {
            this._color.data[3] = value;
            if (this._meshInstance) {
                this._meshInstance.setParameter("material_opacity", value);
            }
        }
    });

    /**
    * @name pc.TextElement#lineHeight
    * @type Number
    * @description The size of a single text line.
    */
    Object.defineProperty(TextElement.prototype, "lineHeight", {
        get: function () {
            return this._lineHeight
        },

        set: function (value) {
            var _prev = this._lineHeight
            this._lineHeight = value;
            if (_prev !== value && this._font) {
                this._updateText();
            }
        }
    });

    /**
    * @name pc.TextElement#spacing
    * @type Number
    * @description The spacing multiplier for the text (to make it more condensed or sparse).
    */
    Object.defineProperty(TextElement.prototype, "spacing", {
        get: function () {
            return this._spacing
        },

        set: function (value) {
            var _prev = this._spacing;
            this._spacing = value;
            if (_prev !== value && this._font) {
                this._updateText();
            }
        }
    });

    /**
    * @name pc.TextElement#align
    * @type String
    * @description The way the text should be aligned in relation to element's bounds. It not only affects the 
    * bounding box positioning, but also changes the text flow, making it be left-aligned, right-aligned or centered.
    */
    Object.defineProperty(TextElement.prototype, "align", {
        get: function() {
            return this._align;
        },

        set: function(value) {
            this._align = value;

            if (this._mesh) {
                this._updateMesh(this._mesh, this._text);
            }
        }
    });

    /**
    * @name pc.TextElement#verticalAlign
    * @type String
    * @description The way the text should be vertically aligned in relation to element's bounds. It only affects the 
    * bounding box positioning, making it be top-aligned, bottom-aligned or centered.
    */
    Object.defineProperty(TextElement.prototype, "verticalAlign", {
        get: function() {
            return this._veticalAlign;
        },

        set: function(value) {
            this._veticalAlign = value;

            if (this._mesh) {
                this._updateMesh(this._mesh, this._text);
            }
        }
    });

    /**
    * @name pc.TextElement#fontSize
    * @type Number
    * @description The font size to use when rendering the text.
    */
    Object.defineProperty(TextElement.prototype, "fontSize", {
        get: function () {
            return this._fontSize;
        },

        set: function (value) {
            var _prev = this._fontSize;
            this._fontSize = value;
            if (_prev !== value && this._font) {
                this._updateText();
            }
        }
    });

    /**
    * @name pc.ImageElement#fontAsset
    * @type pc.Asset
    * @description The font asset to gather the font from.
    */
    Object.defineProperty(TextElement.prototype, "fontAsset", {
        get function () {
            return this._fontAsset;
        },

        set: function (value) {
            var assets = this._system.app.assets;
            var _id = value;

            if (value instanceof pc.Asset) {
                _id = value.id;
            }

            if (this._fontAsset !== _id) {
                if (this._fontAsset) {
                    var _prev = assets.get(this._fontAsset);

                    if (_prev) {
                        _prev.off("load", this._onFontLoad, this);
                        _prev.off("change", this._onFontChange, this);
                        _prev.off("remove", this._onFontRemove, this);
                    }
                }

                this._fontAsset = _id;
                if (this._fontAsset) {
                    var asset = assets.get(this._fontAsset);
                    if (! asset) {
                        assets.on('add:' + this._fontAsset, this._onFontAdded, this);
                    } else {
                        this._bindFont(asset);
                    }
                }
            }
        }
    });

    /**
    * @name pc.ImageElement#font
    * @type pc.Font
    * @description The font currently used for rendering.
    */
    Object.defineProperty(TextElement.prototype, "font", {
        get: function () {
            return this._font;
        },

        set: function (value) {
            this._font = value;
            if (this._font)
                this._updateText();
        }
    });

    Object.defineProperty(TextElement.prototype, "bestFit", {
        get: function () {
            return this._bestFit;
        },

        set: function (value) {
            this._bestFit = value;
            if (this._font) {
                this._updateText();
            }
        }
    });

    Object.defineProperty(TextElement.prototype, "minFontSize", {
        get: function () {
            return this._minFontSize;
        },

        set: function (value) {
            this._minFontSize = value;
            if (this._font) {
                this._updateText();
            }
        }
    });

    Object.defineProperty(TextElement.prototype, "maxFontSize", {
        get: function () {
            return this._maxFontSize;
        },

        set: function (value) {
            this._maxFontSize = value;
            if (this._font) {
                this._updateText();
            }
        }
    });

    Object.defineProperty(TextElement.prototype, "enabled", {
        get: function () {
            return this._enabled;
        },

        set: function (value) {
            this._enabled = value;
            
            if (this._meshInstance) {
                this._meshInstance.visible = value;
            }
        }
    });

    return {
        TextElement: TextElement,

        TEXT_ALIGN_LEFT: 'left',
        TEXT_ALIGN_RIGHT: 'right',
        TEXT_ALIGN_CENTER: 'center',
        TEXT_VERTICAL_ALIGN_TOP: 'top',
        TEXT_VERTICAL_ALIGN_MIDDLE: 'middle',
        TEXT_VERTICAL_ALIGN_BOTTOM: 'bottom'
    };
}());

