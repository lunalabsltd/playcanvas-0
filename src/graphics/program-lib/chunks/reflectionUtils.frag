// Decodes HDR textures
// handles dLDR, RGBM formats
vec3 DecodeHDR( vec4 data, vec4 decodeInstructions ) {
    // Take into account texture alpha if decodeInstructions.w is true(the alpha value affects the RGB channels)
    float alpha = decodeInstructions.w * ( data.a - 1.0 ) + 1.0;
    return ( decodeInstructions.x * alpha ) * data.rgb;
}

vec3 BoxProjectedCubemapDirection( vec3 worldRefl, vec3 worldPos, vec4 cubemapCenter, vec4 boxMin, vec4 boxMax ) {
    if ( cubemapCenter.w > 0.0 ) {
        vec3 nrdir = normalize( worldRefl );
        float nrdirLength = length( nrdir );

        vec3 rbmax = ( boxMax.xyz - worldPos ) / nrdir;
        vec3 rbmin = ( boxMin.xyz - worldPos ) / nrdir;

        vec3 rbminmax = ( nrdirLength > 0.0f ) ? rbmax : rbmin;

        float fa = min( min( rbminmax.x, rbminmax.y ), rbminmax.z );

        worldPos -= cubemapCenter.xyz;
        worldRefl = worldPos + nrdir * fa;
    }

    return worldRefl;
}

vec3 SampleGlossyEnvironment( samplerCube tex, vec4 hdr, vec3 R ) {
    vec4 rgbm = textureCube( tex, R );
    return DecodeHDR( rgbm, hdr );
}