uniform lowp vec4 unity_IndirectSpecColor;

void main(void) {
    dDiffuseLight = vec3(0);
    dSpecularLight = vec3(0);
    dReflection = unity_IndirectSpecColor;
    dSpecularity = vec3(0);
