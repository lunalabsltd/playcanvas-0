#ifdef MAPTEXTURE
uniform sampler2D unity_Lightmap;
uniform highp vec4 unity_Lightmap_HDR;
uniform highp vec4 unity_LightmapST;
#endif

vec3 decodeLightmapRGBM( vec4 data, vec4 decodeInstructions ) {
    return ( decodeInstructions.x * data.a ) * data.rgb;
}

vec3 decodeLightmapLDR( vec4 data, vec4 decodeInstructions ) {
    return decodeInstructions.x * data.rgb;
}

vec3 decodeLightmap( vec4 color, vec4 decodeInstructions ) {
#ifdef LIGHT_MAP_SAMPLER_FORMAT_2
    return decodeLightmapLDR( color, decodeInstructions );
#else
    return decodeLightmapRGBM( color, decodeInstructions );
#endif
}

void addLightMap() {
    vec3 bakedColor = vec3( 0 );

    #ifdef MAPTEXTURE
    	vec2 uv = ( $UV.xy * unity_LightmapST.xy ) + unity_LightmapST.zw;
        vec4 bakedColorTex = texture2D( unity_Lightmap, uv );
        
        bakedColor = decodeLightmap( bakedColorTex, unity_Lightmap_HDR );
    #endif
    
    dDiffuseLight += bakedColor;
}