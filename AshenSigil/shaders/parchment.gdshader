shader_type canvas_item;
// The sigil sheet: fibres and age stains over whatever is drawn on it (paper
// and ink alike), and a ragged burn front that chars, glows and eats it away.

uniform sampler2D grain : filter_linear, repeat_enable;
uniform vec2 sheet_size = vec2(96.0, 118.0);
uniform float burn = 0.0;

varying vec2 local;

void vertex() {
	local = VERTEX;
}

void fragment() {
	vec2 uv = local / sheet_size + 0.5;
	float g = texture(grain, uv * 1.6).r;
	vec4 c = COLOR;
	c.rgb *= 0.82 + 0.3 * g;
	if (burn > 0.0) {
		// Catches at the bottom corner and climbs.
		float n = texture(grain, uv * 0.8 + vec2(0.37, 0.11)).r * 0.7 + (1.0 - uv.y) * 0.2 + (1.0 - uv.x) * 0.1;
		float front = burn * 1.3 - 0.15;
		if (n < front) {
			discard;
		}
		float near = 1.0 - smoothstep(front, front + 0.12, n);
		c.rgb = mix(c.rgb, vec3(0.07, 0.035, 0.02), near);
		c.rgb += vec3(1.0, 0.42, 0.08) * (1.0 - smoothstep(front, front + 0.03, n)) * 1.4;
	}
	COLOR = c;
}
