#ifdef MAPTEXTURE
uniform sampler2D unity_Lightmap;
uniform sampler2D unity_LightmapInd;
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

vec3 decodeDirectionalLightmap( vec3 color, vec4 dirTex, vec3 normalWorld ) {
    float halfLambert = dot( normalWorld, dirTex.xyz - 0.5 ) + 0.5;
    return color * halfLambert / max( 1e-4, dirTex.w );
}

void addLightMap() {
    vec3 bakedColor = vec3( 0 );
    vec4 dir = vec4( 0 );

    #ifdef MAPTEXTURE
        vec2 uv = ( $UV.xy * unity_LightmapST.xy ) + unity_LightmapST.zw;
        vec4 bakedColorTex = texture2D( unity_Lightmap, uv );
        
        bakedColor = decodeLightmap( bakedColorTex, unity_Lightmap_HDR );
        dir = texture2D( unity_LightmapInd, uv );
    #endif

    if ( dot( dir.xyz, vec3(1.0) ) < 0.00001 ) {
        dDiffuseLight += bakedColor;
        return;
    }

    dDiffuseLight += decodeDirectionalLightmap( bakedColor, dir, dNormalW );
}

void addDirLightMap() {
}