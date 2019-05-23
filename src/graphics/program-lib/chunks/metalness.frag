void processMetalness(float metalness) {
    const float dielectricF0 = 0.04;
    dSpecularity = mix(vec3(dielectricF0), dAlbedo, metalness);
    dAlbedo *= 1.0 - metalness;
}

#ifdef MAPFLOAT
uniform float material_metalness;
#endif

#ifdef MAPTEXTURE
uniform sampler2D texture_metalnessMap;
#endif

vec4 dMetallicMapColor;

void getSpecularity() {
    float metalness = 1.0;
    dMetallicMapColor = vec4(1.0);

    #ifdef MAPFLOAT
        metalness *= material_metalness;
    #endif

    #ifdef MAPTEXTURE
        vec4 mapColor = texture2D(texture_metalnessMap, $UV);

        dMetallicMapColor *= mapColor;
        metalness *= mapColor.$CH;
    #endif

    #ifdef MAPVERTEX
        dMetallicMapColor *= vVertexColor;
        metalness *= saturate(vVertexColor.$VC);
    #endif

    processMetalness(metalness);
}

