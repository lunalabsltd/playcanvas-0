// SH lighting environment
uniform highp vec4 unity_SHAr;
uniform highp vec4 unity_SHAg;
uniform highp vec4 unity_SHAb;
uniform highp vec4 unity_SHBr;
uniform highp vec4 unity_SHBg;
uniform highp vec4 unity_SHBb;
uniform highp vec4 unity_SHC;

vec3 LinearToGammaSpace( vec3 linRGB ) {
    linRGB = max(linRGB, vec3(0., 0., 0.));
    linRGB.x = pow(linRGB.x, 0.416666667);
    linRGB.y = pow(linRGB.y, 0.416666667);
    linRGB.z = pow(linRGB.z, 0.416666667);

    return max(1.055 * linRGB - 0.055, 0.);
}

vec3 SHEvalLinearL0L1( vec4 normal ) {
    vec3 x = vec3( 0 );

    // Linear (L1) + constant (L0) polynomial terms
    x.r = dot( unity_SHAr, normal );
    x.g = dot( unity_SHAg, normal );
    x.b = dot( unity_SHAb, normal );

    return x;
}

vec3 SHEvalLinearL2( vec4 normal ) {
    vec3 x1 = vec3( 0 );
    vec3 x2 = vec3( 0 );
    
    vec4 vB = normal.xyzz * normal.yzzx;

    x1.r = dot( unity_SHBr, vB );
    x1.g = dot( unity_SHBg, vB );
    x1.b = dot( unity_SHBb, vB );

    float vC = normal.x * normal.x - normal.y * normal.y;
    x2 = unity_SHC.rgb * vC;

    return x1 + x2;
}

void addAmbient() {
    vec4 n = vec4( dNormalW, 1.0 );

    vec3 color = SHEvalLinearL0L1( n );
    color += SHEvalLinearL2( n );

    color = LinearToGammaSpace(color);

    dDiffuseLight += processEnvironment( max( color, vec3(0.0) ) );
}

