uniform vec3 unity_FogColor;
uniform vec4 unity_FogParams;

vec3 addFog(vec3 color) {
    float depth = gl_FragCoord.z / gl_FragCoord.w;
    float coord = depth;

    float unityFogFactor = unity_FogParams.x * coord; 
    unityFogFactor = exp2( -unityFogFactor * unityFogFactor );
    unityFogFactor = clamp( unityFogFactor, 0.0, 1.0 );
    
    return (color - unity_FogColor) * unityFogFactor + unity_FogColor;
}