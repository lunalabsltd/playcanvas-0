vec3 combineColor() {
	dAlpha = max( dAlpha, max(dSpecularity.r, max(dSpecularity.g, dSpecularity.b)) );
    return mix(dAlbedo * dDiffuseLight, dSpecularLight + dReflection.rgb * dReflection.a, dSpecularity);
}

