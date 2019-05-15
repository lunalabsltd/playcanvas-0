uniform float material_reflectivity;

uniform samplerCube unity_SpecCube0;

uniform vec4 unity_SpecCube0_BoxMax;
uniform vec4 unity_SpecCube0_BoxMin;
uniform vec4 unity_SpecCube0_ProbePosition;
uniform vec4 unity_SpecCube0_HDR;

void addReflection() {
	vec3 r = BoxProjectedCubemapDirection( dReflDirW, vPositionW, unity_SpecCube0_ProbePosition, unity_SpecCube0_BoxMin, unity_SpecCube0_BoxMax );
    dReflection.xyz = SampleGlossyEnvironment( unity_SpecCube0, unity_SpecCube0_HDR, r );
}
