vec3 getNormal() {
    #ifdef SKIN
        dNormalMatrix = mat3(dModelMatrix[0].xyz, dModelMatrix[1].xyz, dModelMatrix[2].xyz);
    #elif defined(INSTANCING)
        dNormalMatrix = mat3(instance_line1.xyz, instance_line2.xyz, instance_line3.xyz);
    #else
        dNormalMatrix = matrix_normal;
    #endif

    if ( dot(vertex_normal, vertex_normal) < 0.001 ) {
    	return normalize( dNormalMatrix[2] );
    }

    return normalize(dNormalMatrix * vertex_normal);
}

