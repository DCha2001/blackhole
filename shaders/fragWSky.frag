#version 330 core
out vec4 FragColor;

uniform vec2 iResolution;
uniform vec3 cameraPos;
uniform mat4 viewMatrix;

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

float calcb(vec3 rayDirWorld) {
    return length(cross(cameraPos, normalize(rayDirWorld)));
}

// ==============================
// Ray deflection logic
// ==============================
float angle(float b) {
    // weak-field approx: delta ~ 2*r_s / b (derived from 4GM/(c^2 b) with our r_s)
    float weak = 2.0 * r_s / max(b, 1e-6);

    // enhancement factor when near b_crit: produces larger deflection but smoothly
    float distToCrit = (b - b_crit);
    // small scale controls how sharply angle grows near b_crit
    float scale = 0.08 * b_crit;
    float nearFactor = 1.0 + 3.0 * exp(- (distToCrit*distToCrit) / (scale*scale) );

    // combine and saturate with an arctan so it can't blow up
    float raw = weak * nearFactor;
    float saturated = atan(raw) * 2.0; // maps large values into (0, PI)
    // clamp to a safe maximum (radians) to avoid reversing direction completely
    return clamp(saturated, 0.0, 6.0);
}

vec3 calcDnew(vec3 D, vec3 axis, float angle){
    return D * cos(angle) + cross(axis, D) * sin(angle) + axis * dot(axis, D) * (1.0 - cos(angle));
}

// ==============================
// Gravitational lensing color
// ==============================
vec3 computeLensedColor(float b) {
    float normalized = b / b_crit;
    float intensity = exp(-pow(normalized - 1.0, 2.0) * 10.0); // bright near photon sphere
    vec3 baseColor = vec3(1.0, 0.8, 0.6); // warm light
    vec3 redshift = vec3(1.0, 0.3, 0.0);  // red tint near horizon
    vec3 color = mix(redshift, baseColor, normalized);
    return color * intensity;
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

// --- rotate vector v around axis by ang ---
vec3 rotateAroundAxis(vec3 v, vec3 axis, float ang) {
    return v * cos(ang) + cross(axis, v) * sin(ang) + axis * dot(axis, v) * (1.0 - cos(ang));
}

// --- compute impact parameter ---
float computeImpactParameter(vec3 O, vec3 D) {
    return length(cross(O, normalize(D)));
}

// --- main lens sampling ---
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
        float baseAlpha = angle(b);
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
    mat4 invView = inverse(viewMatrix);
    vec3 rayDirWorld = normalize((invView * vec4(rayDirCam, 0.0)).xyz);
    vec3 ro = cameraPos;

    // Impact parameter
    float b = calcb(rayDirWorld);

    // ==============================
    // Ray bending
    // ==============================
    if (b <= b_crit*5.0) {
        float denom = dot(rayDirWorld, rayDirWorld);
        float line = -dot(cameraPos, rayDirWorld) / denom;
        vec3 R = cameraPos + line * rayDirWorld;
        vec3 axis = normalize(cross(rayDirWorld, R));
        float ang = angle(b);
        rayDirWorld = normalize(calcDnew(rayDirWorld, axis, ang));
    }

    // ==============================
    // Ray marching
    // ==============================
    float t = 0.0;
    float d;
    bool hit = false;
    vec3 p;

    for(int i = 0; i < 500; i++) {
        p = ro + rayDirWorld * t;
        d = sceneSDF(p);
        if(d < 0.001) { hit = true; break; }
        if(t > 100.0) break;
        t += d;
    }

    // ==============================
    // Shading logic
    // ==============================
    if(hit) {

        if(b <= b_crit) {
            FragColor = vec4(0.0, 0.0, 0.0, 1.0);
            return;
        }

        vec3 lensColor = computeLensedColor(b);
        FragColor = vec4(lensColor, 1.0);
    }
    else {
        vec3 bg = sampleLensedSky(cameraPos, rayDirWorld, b);
        FragColor = vec4(bg, 1.0);
    }
}
