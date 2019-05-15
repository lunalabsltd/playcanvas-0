uniform float material_reflectivity;

uniform samplerCube unity_SpecCube0;
uniform samplerCube unity_SpecCube1;

uniform vec4 unity_SpecCube0_BoxMax;
uniform vec4 unity_SpecCube0_BoxMin;
uniform vec4 unity_SpecCube0_ProbePosition;
uniform vec4 unity_SpecCube0_HDR;

uniform vec4 unity_SpecCube1_BoxMax;
uniform vec4 unity_SpecCube1_BoxMin;
uniform vec4 unity_SpecCube1_ProbePosition;
uniform vec4 unity_SpecCube1_HDR;

void addReflection() {
	vec3 r0 = BoxProjectedCubemapDirection( dReflDirW, vPositionW, unity_SpecCube0_ProbePosition, unity_SpecCube0_BoxMin, unity_SpecCube0_BoxMax );
    vec3 env0 = SampleGlossyEnvironment( unity_SpecCube0, unity_SpecCube0_HDR, r0 );
    
    float kBlendFactor = 0.99999;
    float blendLerp = unity_SpecCube0_BoxMin.w;

    if ( blendLerp < kBlendFactor ) {
        vec3 r1 = BoxProjectedCubemapDirection( dReflDirW, vPositionW, unity_SpecCube1_ProbePosition, unity_SpecCube1_BoxMin, unity_SpecCube1_BoxMax );
        vec3 env1 = SampleGlossyEnvironment( unity_SpecCube1, unity_SpecCube1_HDR, r1 );
         
        dReflection.xyz = mix( env1, env0, blendLerp );
    } else {
        dReflection.xyz = env0;
    }
}
