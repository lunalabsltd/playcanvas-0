Object.assign(pc, function () {
    'use strict';

    var ScopeId = function (name) {
        // Set the name
        this.name = name;

        // Set the default value
        this.value = null;

        // keeps the reference to the previous value
        this.previous_value = null;

        // Create the version object
        this.versionObject = new pc.VersionedObject();
    };

    Object.assign(ScopeId.prototype, {
        setValue: function (value) {
            // Set the new value
            this.value = value;

            // Increment the revision
            this.versionObject.increment();
        },

        pushValue: function (value) {
            if ( this.previous_value ) {
                throw new Error( "pushValue is limited to storing 1 previous value" );
            }

            this.previous_value = this.value;
            this.setValue( value );
        },

        popValue: function () {
            this.setValue( this.previous_value );
            this.previous_value = null;
        },

        getValue: function (value) {
            return this.value;
        }
    });

    return {
        ScopeId: ScopeId
    };
}());
