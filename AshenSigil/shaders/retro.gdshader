shader_type canvas_item;
// Low-resolution finish for the 3D world: sample the frame on a coarse pixel
// grid, mute and warm the colours, then quantise with a 4x4 ordered dither.

uniform sampler2D screen : hint_screen_texture, filter_nearest;
uniform float pixel_size = 2.0;
uniform float saturation = 0.8;
uniform float levels = 30.0;
uniform float dither = 0.9;
uniform vec3 shadow_tint : source_color = vec3(0.075, 0.055, 0.045);

float bayer2(vec2 a) {
	a = floor(a);
	return fract(a.x / 2.0 + a.y * a.y * 0.75);
}

float bayer4(vec2 a) {
	return bayer2(0.5 * a) * 0.25 + bayer2(a);
}

void fragment() {
	vec2 cell = floor(FRAGCOORD.xy / pixel_size);
	vec2 uv = (cell + 0.5) * pixel_size * SCREEN_PIXEL_SIZE;
	vec3 c = texture(screen, uv).rgb;
	float l = dot(c, vec3(0.299, 0.587, 0.114));
	c = mix(vec3(l), c, saturation);
	// Shadows sink into brown-black rather than pure black.
	c = mix(shadow_tint, c, smoothstep(0.0, 0.12, l) * 0.85 + 0.15);
	c += (bayer4(cell) - 0.5) * dither / levels;
	c = floor(c * levels + 0.5) / levels;
	COLOR = vec4(c, 1.0);
}
