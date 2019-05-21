#ifdef MAPCOLOR
uniform vec3 material_specular;
#endif

#ifdef MAPTEXTURE
uniform sampler2D texture_specularMap;
#endif

vec4 dSpecularMapColor;

void getSpecularity() {
    dSpecularity = vec3(1.0);
    dSpecularMapColor = vec4(1.0);

    #ifdef MAPCOLOR
        dSpecularity *= material_specular;
    #endif

    #ifdef MAPTEXTURE
        vec4 mapColor = texture2D(texture_specularMap, $UV);

        dSpecularMapColor *= mapColor;
        dSpecularity *= mapColor.$CH;
    #endif

    #ifdef MAPVERTEX
        dSpecularMapColor *= vVertexColor;
        dSpecularity *= saturate(vVertexColor.$VC);
    #endif
}

