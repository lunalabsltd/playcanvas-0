vec3 getNormal() {
    #ifdef SKIN
        dNormalMatrix = mat3(dModelMatrix[0].xyz, dModelMatrix[1].xyz, dModelMatrix[2].xyz);
    #elif defined(INSTANCING)
        dNormalMatrix = mat3(instance_line1.xyz, instance_line2.xyz, instance_line3.xyz);
    #else
        dNormalMatrix = matrix_normal;
    #endif

    vec3 normal = mix( vec3( 0.0, 1.0, 0.0 ), vertex_normal, step( 1e-5, dot(vertex_normal, vertex_normal) ) );

    return normalize( dNormalMatrix * normal );
}

