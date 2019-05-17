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

        vec3 rbmax = ( boxMax.xyz - worldPos ) / nrdir;
        vec3 rbmin = ( boxMin.xyz - worldPos ) / nrdir;

        vec3 rbminmax = vec3(0);

        rbminmax.x = nrdir.x > 0.0 ? rbmax.x : rbmin.x;
        rbminmax.y = nrdir.y > 0.0 ? rbmax.y : rbmin.y;
        rbminmax.z = nrdir.z > 0.0 ? rbmax.z : rbmin.z;

        float fa = min( min( rbminmax.x, rbminmax.y ), rbminmax.z );

        worldPos -= cubemapCenter.xyz;
        worldRefl = worldPos + nrdir * fa;
    }

    return worldRefl;
}

vec3 SampleGlossyEnvironment( samplerCube tex, vec4 texels, vec4 hdr, vec3 R ) {
    float mipLevels = log2( texels.z );

    float perceptualRoughness = ( 1.0 - dGlossiness );
    perceptualRoughness = perceptualRoughness * ( 1.7 - 0.7 * perceptualRoughness );

    float mip = perceptualRoughness * mipLevels;

    vec4 rgbm = textureCubeLod( tex, R, mip );

    return DecodeHDR( rgbm, hdr );
}