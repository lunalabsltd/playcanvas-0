#ifdef MAPCOLOR
uniform vec3 material_diffuse;
#endif

#ifdef MAPTEXTURE
uniform sampler2D texture_diffuseMap;
#endif

vec4 dAlbedoMapColor;

void getAlbedo() {
    dAlbedo = vec3(1.0);
    dAlbedoMapColor = vec4(1.0);

    #ifdef MAPCOLOR
        dAlbedo *= material_diffuse.rgb;
        dAlbedoMapColor.a *= dAlpha;
    #endif

    #ifdef MAPTEXTURE
        vec4 mapColor = texture2DSRGB(texture_diffuseMap, $UV);

        #ifdef ALBEDO_TRANSPARENCY
            dAlpha *= mapColor.a;
            dAlbedoMapColor.a = dAlpha;
        #endif
        
        dAlbedoMapColor *= mapColor;
        dAlbedo *= mapColor.$CH;
    #endif

    #ifdef MAPVERTEX
        dAlbedoMapColor *= vVertexColor;
        dAlbedo *= gammaCorrectInput(saturate(vVertexColor.$VC));
    #endif
}

