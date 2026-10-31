shader_type spatial;
render_mode diffuse_lambert, specular_disabled;
// Cobbled yard that gives way to mud toward the walls; mud also creeps into
// the gaps between stones.

uniform sampler2D cobble_albedo : source_color, filter_linear_mipmap, repeat_enable;
uniform sampler2D cobble_normal : hint_normal, filter_linear_mipmap, repeat_enable;
uniform sampler2D mud_albedo : source_color, filter_linear_mipmap, repeat_enable;
uniform sampler2D mud_normal : hint_normal, filter_linear_mipmap, repeat_enable;
uniform sampler2D blend_noise : filter_linear, repeat_enable;
uniform float cobble_scale = 0.38;
uniform float mud_scale = 0.3;
uniform float stone_radius = 10.5;
uniform vec3 tint : source_color = vec3(0.86, 0.82, 0.78);

varying vec3 world_pos;

void vertex() {
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec2 p = world_pos.xz;
	float n = texture(blend_noise, p * 0.035).r;
	float r = length(p) + (n - 0.5) * 9.0;
	float m = smoothstep(stone_radius - 2.5, stone_radius + 2.5, r);
	vec3 ca = texture(cobble_albedo, p * cobble_scale).rgb;
	vec3 ma = texture(mud_albedo, p * mud_scale).rgb;
	float gaps = 1.0 - smoothstep(0.08, 0.3, dot(ca, vec3(0.333)));
	m = clamp(m + gaps * n * 0.8, 0.0, 1.0);
	ALBEDO = mix(ca, ma * 0.8, m) * tint;
	NORMAL_MAP = mix(texture(cobble_normal, p * cobble_scale).rgb, texture(mud_normal, p * mud_scale).rgb, m);
	ROUGHNESS = 1.0;
}
