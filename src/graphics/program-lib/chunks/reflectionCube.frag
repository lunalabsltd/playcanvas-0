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
    vec3 lookupVec = fixSeams( cubeMapProject( dReflDirW ) );
    dReflection += vec4( $textureCubeSAMPLE( unity_SpecCube0, lookupVec ).rgb, material_reflectivity );
}
