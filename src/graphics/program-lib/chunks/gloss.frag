#ifdef MAPFLOAT
uniform float material_shininess;
#endif

void getGlossiness() {
    dGlossiness = 1.0;

    #ifdef MAPFLOAT
        dGlossiness *= material_shininess;
    #endif

    #ifdef METALLIC_ALPHA_SMOOTHNESS
        dGlossiness *= dMetallicMapColor.a;
    #endif

    #ifdef SPECULARITY_ALPHA_SMOOTHNESS
        dGlossiness *= dSpecularMapColor.a;
    #endif

    #ifdef ALBEDO_ALPHA_SMOOTHNESS
        dGlossiness *= dAlbedoMapColor.a;
    #endif

    dGlossiness += 0.0000001;
}

