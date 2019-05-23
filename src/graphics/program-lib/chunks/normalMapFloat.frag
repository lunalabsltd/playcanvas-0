uniform sampler2D texture_normalMap;
uniform float material_bumpiness;

void getNormal() {
    vec4 packedNormal = texture2D(texture_normalMap, $UV);
    packedNormal.x *= packedNormal.w;

    vec3 normal = vec3( 0 );
   	
   	normal.xy = ( packedNormal.xy * 2.0 - 1.0 );
    normal.xy *= material_bumpiness;
    normal.z = sqrt( 1.0 - saturate( dot(normal.xy, normal.xy) ) );

	dNormalW = dTBN * normal;
}