uniform vec3 unity_FogColor;
uniform vec4 unity_FogParams;

vec3 addFog(vec3 color) {
    float depth = gl_FragCoord.z / gl_FragCoord.w;
    float factor = depth * unity_FogParams.x;
    factor *= -factor;
    factor = exp2( factor );
    
    factor = clamp( factor, 0.0, 1.0 );
    
    return (color - unity_FogColor) * factor + unity_FogColor;
}