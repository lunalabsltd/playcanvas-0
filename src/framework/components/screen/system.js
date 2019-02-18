Object.assign(pc, function () {
    var _schema = ['enabled'];

    /**
     * @constructor
     * @name pc.ScreenComponentSystem
     * @classdesc Manages creation of {@link pc.ScreenComponent}s.
     * @description Create a new ScreenComponentSystem
     * @class Allows screens to be attached to an entity
     * @param {pc.Application} app The application
     * @extends pc.ComponentSystem
     */
    var ScreenComponentSystem = function ScreenComponentSystem(app) {
        pc.ComponentSystem.call(this, app);

        this.id = 'screen';
        this.app = app;

        this.ComponentType = pc.ScreenComponent;
        this.DataType = pc.ScreenComponentData;

        this.schema = _schema;

        this.windowResolution = new pc.Vec2();

        // queue of callbacks
        this._drawOrderSyncQueue = new pc.IndexedList();

        this.app.graphicsDevice.on("resizecanvas", this._onResize, this);

        pc.ComponentSystem.on('update', this._onUpdate, this);

        this.on('beforeremove', this.onRemoveComponent, this);
    };
    ScreenComponentSystem.prototype = Object.create(pc.ComponentSystem.prototype);
    ScreenComponentSystem.prototype.constructor = ScreenComponentSystem;

    pc.Component._buildAccessors(pc.ScreenComponent.prototype, _schema);

    Object.assign(ScreenComponentSystem.prototype, {
        initializeComponentData: function (component, data, properties) {
            if (data.priority !== undefined) component.priority = data.priority;
            if (data.screenSpace !== undefined) component.screenSpace = data.screenSpace;
            component.cull = component.screenSpace;
            if (data.screenType !== undefined) component.screenType = data.screenType;
            if (data.scaleMode !== undefined) component.scaleMode = data.scaleMode;
            if (data.scaleBlend !== undefined) component.scaleBlend = data.scaleBlend;
            if (data.screenDistance !== undefined) component.screenDistance = data.screenDistance;
            if (data.layer !== undefined) component.layer = data.layer;
            if (data.drawOrder !== undefined) component.drawOrder = data.drawOrder;
            if (data.resolution !== undefined) {
                if (data.resolution instanceof pc.Vec2){
                    component._resolution.copy(data.resolution);
                } else {
                    component._resolution.set(data.resolution[0], data.resolution[1]);
                }
                component.resolution = component._resolution;
            }
            if (data.referenceResolution !== undefined) {
                if (data.referenceResolution instanceof pc.Vec2){
                    component._referenceResolution.copy(data.referenceResolution);
                } else {
                    component._referenceResolution.set(data.referenceResolution[0], data.referenceResolution[1]);
                }
                component.referenceResolution = component._referenceResolution;
            }

            // queue up a draw order sync
            component.syncDrawOrder();
            pc.ComponentSystem.prototype.initializeComponentData.call(this, component, data, properties);
            component._updateScreenInChildren();
        },

        destroy: function () {
            this.off();
            this.app.graphicsDevice.off("resizecanvas", this._onResize, this);
        },

        _syncDrawOrder: function () {
            var i = 0;

            var recurse = function (e) {
                if (e.element) {
                    e.element.drawOrder = i++;
                }

                var children = e.getChildren();
                for (var j = 0; j < children.length; j++) {
                    recurse(children[j]);
                }
            }

            recurse(pc.Application.getApplication().root);
        },

        _onUpdate: function (dt) {
            var components = this.store;

            if (this._dirtyOrder) {
                this._syncDrawOrder();
                this._dirtyOrder = false;
            }

            for (var id in components) {
                if (components[id].entity.screen.update) components[id].entity.screen.update(dt);
            }
        },

        _onResize: function (width, height) {
            this.windowResolution.x = width;
            this.windowResolution.y = height;
        },

        cloneComponent: function (entity, clone) {
            var screen = entity.screen;

            return this.addComponent(clone, {
                enabled: screen.enabled,
                screenType: screen.screenType,
                scaleMode: screen.scaleMode,
                resolution: screen.resolution.clone(),
                referenceResolution: screen.referenceResolution.clone()
            });
        },

        onRemoveComponent: function (entity, component) {
            component.onRemove();
        },

        processDrawOrderSyncQueue: function () {
            var list = this._drawOrderSyncQueue.list();

            for (var i = 0; i < list.length; i++) {
                var item = list[i];
                item.callback.call(item.scope);
            }
            this._drawOrderSyncQueue.clear();
        },

        queueDrawOrderSync: function (id, fn, scope) {
            // first queued sync this frame
            // attach an event listener
            if (!this._drawOrderSyncQueue.list().length) {
                this.app.once('prerender', this.processDrawOrderSyncQueue, this);
            }

            if (!this._drawOrderSyncQueue.has(id)) {
                this._drawOrderSyncQueue.push(id, {
                    callback: fn,
                    scope: scope
                });
            }
        }
    });

    return {
        ScreenComponentSystem: ScreenComponentSystem
    };
}());
