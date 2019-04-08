gl_FragColor.a = dAlpha;
vec3 lv = normalize( view_position - vPositionW );
//gl_FragColor = abs( vec4( lv, 1 ) );
