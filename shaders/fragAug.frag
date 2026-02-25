#version 330 core
out vec4 FragColor;

uniform vec2 iResolution;
uniform vec3 cameraPos;
uniform mat4 viewMatrix;
uniform mat4 invViewMatrix;

// ==============================
// Black hole physical constants
// ==============================
float r_s = 1.0;             // Schwarzschild radius
float r_ph = 1.5 * r_s;      // Photon sphere radius
float b_crit = 2.598 * r_s;  // Critical impact parameter

// ==============================
// Signed Distance Functions
// ==============================
float sphereSDF(vec3 p, vec3 center, float radius) {
    return length(p - center) - radius;
}

float sceneSDF(vec3 p) {
    return sphereSDF(p, vec3(0.0), r_s);
}

// ==============================
// Utility functions
// ==============================
vec3 getNormal(vec3 p) {
    float eps = 0.001;
    vec2 e = vec2(1.0, -1.0) * 0.5773;
    return normalize(
        e.xyy * sceneSDF(p + e.xyy * eps) +
        e.yyx * sceneSDF(p + e.yyx * eps) +
        e.yxy * sceneSDF(p + e.yxy * eps) +
        e.xxx * sceneSDF(p + e.xxx * eps)
    );
}

// ==============================
// Impact parameter & rotation
// ==============================
// compute impact parameter for ray r(t)=O + t D w.r.t origin (center at vec3(0))
float calcb(vec3 O, vec3 D) {
    // assume D is normalized
    return length(cross(O, D));
}

// Rodrigues rotation (axis assumed normalized)
vec3 rotateRodrigues(vec3 v, vec3 axis, float ang) {
    return v * cos(ang) + cross(axis, v) * sin(ang) + axis * dot(axis, v) * (1.0 - cos(ang));
}

// ==============================
// Deflection models (stable)
// ==============================
float deflectionAngleStable(float b, float r_s, float b_crit) {
    // weak-field approx: delta ~ 2*r_s / b
    float weak = 2.0 * r_s / max(b, 1e-6);

    // enhancement near b_crit: smooth Gaussian-like bump
    float distToCrit = (b - b_crit);
    float scale = 0.08 * b_crit; // controls sharpness near critical impact parameter
    float nearFactor = 1.0 + 3.0 * exp(- (distToCrit * distToCrit) / (scale * scale));

    // combine and saturate
    float raw = weak * nearFactor;
    float saturated = atan(raw) * 2.0; // maps to (0, ~PI)
    return clamp(saturated, 0.0, 6.0);
}

// ==============================
// Gravitational lensing color
// ==============================
vec3 computeLensedColor(float b) {
    float normalized = b / b_crit;
    float intensity = exp(-pow(normalized - 1.0, 2.0) * 12.0); // bright near photon sphere
    vec3 baseColor = vec3(1.0, 0.8, 0.6); // warm light
    vec3 redshift = vec3(0.9, 0.45, 0.25);  // red tint nearer horizon
    vec3 color = mix(baseColor, redshift, smoothstep(1.0, 0.3, normalized)); // more red as normalized gets small
    // boost intensity slightly when exactly near r_ph
    float phBoost = exp(-pow((normalized - (r_ph / b_crit)), 2.0) * 50.0);
    return color * (intensity + 0.6 * phBoost);
}

// ===============================
//   Lensed Starfield Background
// ===============================
const int MAX_ORDERS = 5;
const float TWO_PI = 6.28318530718;

// --- simple hash for star noise ---
float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
}

// --- procedural starfield background ---
vec3 skyColor(vec3 dir) {
    float t = 0.5 * (dir.y + 1.0);
    vec3 base = mix(vec3(0.02, 0.02, 0.06), vec3(0.15, 0.25, 0.5), t);

    vec2 uv = vec2(atan(dir.z, dir.x) / TWO_PI + 0.5, asin(dir.y) / 3.14159265 + 0.5);
    float s = hash21(floor(uv * 1024.0));
    float star = step(0.9995, s) * pow(hash21(uv * 4321.0), 10.0);

    return base + vec3(star);
}

// --- approximate deflection angle (kept for sampleLensedSky but not used in marching) ---
float deflectionAngleApprox(float b, float r_s, float b_crit) {
    float rel = (b - b_crit) / (0.2 * b_crit);
    rel = clamp(rel, -5.0, 5.0);
    return clamp((1.0 / (rel * rel + 0.001)) * (0.25 * r_s), 0.0, 20.0);
}

// --- rotate vector v around axis by ang ---
vec3 rotateAroundAxis(vec3 v, vec3 axis, float ang) {
    return v * cos(ang) + cross(axis, v) * sin(ang) + axis * dot(axis, v) * (1.0 - cos(ang));
}

// --- main lens sampling (used for background sampling) ---
vec3 sampleLensedSky(vec3 ro, vec3 D, float b) {
    vec3 Dn = normalize(D);
    if (b <= b_crit) return vec3(0.0);

    vec3 r = ro;
    vec3 axisRaw = cross(Dn, r);
    float axisLen = length(axisRaw);
    if (axisLen < 1e-6) return skyColor(Dn);

    vec3 axis = axisRaw / axisLen;

    vec3 accum = vec3(0.0);
    float totalWeight = 0.0;

    for (int n = 0; n <= MAX_ORDERS; ++n) {
        float baseAlpha = deflectionAngleApprox(b, r_s, b_crit);
        float alphaN = baseAlpha + float(n) * TWO_PI;

        float weight = exp(-float(n) * 4.0);
        float closeness = exp(-abs((b - b_crit) / (0.1 * b_crit)));
        weight *= closeness;

        vec3 bent = rotateAroundAxis(Dn, axis, alphaN);
        vec3 sample = skyColor(bent);

        accum += sample * weight;
        totalWeight += weight;
    }

    return (totalWeight > 0.0) ? accum / totalWeight : skyColor(Dn);
}

// ==============================
// Main fragment
// ==============================
void main() {
    // Normalized screen coordinates
    vec2 uv = (gl_FragCoord.xy / iResolution) * 2.0 - 1.0;
    uv.x *= iResolution.x / iResolution.y;

    // Ray setup
    vec3 rayDirCam = normalize(vec3(uv, -1.0));
    vec3 rayDirWorld = normalize((invViewMatrix * vec4(rayDirCam, 0.0)).xyz);
    vec3 ro = cameraPos;

    // precompute global impact parameter
    float b_global = calcb(ro, rayDirWorld);

    // ==============================
    // Ray marching with integrated bending
    // ==============================
    float t = 0.0;
    float d;
    bool hit = false;
    vec3 p;
    vec3 D = rayDirWorld; // will be updated along path
    vec3 O = ro;

    // Simple heuristic: if global impact param is well below critical, it's likely captured
    bool likelyCaptured = (b_global <= b_crit * 0.95);

    const int MAX_STEPS = 500;
    const float MAX_DIST = 100.0;
    const float MIN_STEP = 0.001;
    const float BEND_UPDATE_INTERVAL = 2.0; // apply bending every N marching steps

    for (int i = 0; i < MAX_STEPS; ++i) {
        p = O + D * t;
        d = sceneSDF(p);

        if (d < 0.001) { hit = true; break; }
        if (t > MAX_DIST) break;

        // safe step (sphere SDF gives radius to horizon)
        float step = max(d, MIN_STEP);
        t += step;

        // update direction occasionally to model accumulated bending
        if ((i % int(max(1.0, BEND_UPDATE_INTERVAL))) == 0) {
            vec3 toCenter = p; // origin is center of BH
            vec3 axisRaw = cross(D, toCenter);
            float axisLen = length(axisRaw);
            if (axisLen > 1e-6) {
                vec3 axis = axisRaw / axisLen;

                // approximate local impact parameter at this step
                float local_b = length(cross(toCenter, D)) / max(1e-6, length(D));

                // compute stable deflection angle for local_b
                float ang = deflectionAngleStable(local_b, r_s, b_crit);

                // falloff factor: stronger bending when closer to BH (use r_ph for reference)
                float r = max(length(toCenter), 1e-6);
                float falloff = clamp((r_ph / r), 0.0, 4.0);

                // incremental rotation amount (small, integrates over many steps)
                // tuned constants: 0.18 and scale by 1/MAX_STEPS to avoid instant huge rotation
                float incremental = 0.18 * ang * (falloff / float(MAX_STEPS)) * 200.0;
                incremental = clamp(incremental, 0.0, 1.2);

                D = normalize( rotateRodrigues(D, axis, incremental) );
            }
        }
    }

    // final direction after integrated bending
    rayDirWorld = D;

    // ==============================
    // Shading logic
    // ==============================
    if (hit) {
        // We intersected the Schwarzschild radius sphere -> black.
        FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    } else {
        // background sampling: use the sampleLensedSky routine which simulates multiple images
        vec3 bg = sampleLensedSky(cameraPos, rayDirWorld, b_global);

        // also compute ring/brightening based on how close b_global is to b_crit
        float ringProximity = exp(-pow((b_global - b_crit) / (0.03 * b_crit), 2.0));
        vec3 ringColor = computeLensedColor(b_global);

        // mix background and ring color (ring overlays background)
        vec3 final = mix(bg, ringColor, smoothstep(0.0, 0.85, ringProximity));

        FragColor = vec4(final, 1.0);
    }
}
