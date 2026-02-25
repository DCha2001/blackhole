#version 330 core
out vec4 FragColor;

uniform vec2 iResolution;
uniform vec3 cameraPos;
uniform mat4 viewMatrix;

// Black hole parameters
float r_s = 1.0;             // Schwarzschild radius
float r_ph = 1.5 * r_s;      // Photon sphere radius
float b_crit = 2.598 * r_s;  // Critical impact parameter

// SDF for a sphere
float sphereSDF(vec3 p, vec3 center, float radius) {
    return length(p - center) - radius;
}

// Scene SDF (just the black hole)
float sceneSDF(vec3 p) {
    return sphereSDF(p, vec3(0.0), r_s);
}

// Compute normal using finite differences
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

// Compute impact parameter b
float calcb(vec3 rayDirWorld) {
    vec3 r = cameraPos - vec3(0.0); // vector to BH
    return length(cross(cameraPos, normalize(rayDirWorld)));
}

float angle(float b) {
    // simple smooth approximation: stronger deflection near b_crit
    float x = (b - b_crit) / (b_crit * 0.2); // normalized distance from critical
    // use an eased falloff, with a sharp growth near x=0:
    return 0.5 * r_s * (1.0 / (x*x + 0.0001)); // tweak constants for visual effect

    //float rel = b_crit / max(b, b_crit);
    //return 4.0 * r_s * pow(rel, 2.0); // smoother decay
}


vec3 calcDnew(vec3 D, vec3 axis, float angle){
    return D * cos(angle) + cross(axis, D) * sin(angle) + axis * dot(axis, D) * (1.0 - cos(angle));
}

// Optional: simple time dilation factor (not used for coloring here)
float determineRayTrad(float b) {
    if(b < b_crit) return 100.0;
    else if(b < b_crit * 1.5) return 50.0;
    else if(b < b_crit * 2.0) return 20.0;
    else return 10.0;
}

void main() {
    // Normalized screen coordinates
    vec2 uv = (gl_FragCoord.xy / iResolution) * 2.0 - 1.0;
    uv.x *= iResolution.x / iResolution.y;

    // Ray in camera space
    vec3 rayDirCam = normalize(vec3(uv, -1.0));

    // Transform to world space
    mat4 invView = inverse(viewMatrix);
    vec3 rayDirWorld = normalize((invView * vec4(rayDirCam, 0.0)).xyz);
    vec3 ro = cameraPos;

    float b = calcb(rayDirWorld);
    
    if (b < b_crit*2.0){
        float denom = dot(rayDirWorld, rayDirWorld);
        vec3 R = vec3(0.0);
        

        float line = -dot(cameraPos, rayDirWorld) / denom;         // line along infinite line
        R = cameraPos + line * rayDirWorld;           // vector from BH(0) to closest point

        float ang = angle(b);

        vec3 axis = normalize(cross(rayDirWorld, R));

        vec3 dnew = calcDnew(rayDirWorld, axis, ang);
        rayDirWorld = normalize(dnew);
    }



    // Ray marching
    float t = 0.0;
    float d;
    bool hit = false;
    vec3 p;
    for(int i = 0; i < 1000; i++) {
        p = ro + rayDirWorld * t;
        d = sceneSDF(p);
        if(d < 0.001) { hit = true; break; }
        if(t > 100.0) break;
        t += d;
    }

    if(hit) {

        // Event horizon
        float adjustedLength = length(p); // in horizon
        if(b < b_crit) {
            FragColor = vec4(0.0, 0.0, 0.0, 1.0);
            return;
        }

        // Gravitational lensing zones (optional visualization)

        float intensity = smoothstep(r_s, r_s*3.0, adjustedLength);
        vec3 lensColor = mix(vec3(1.0, 0.3, 0.0), vec3(0.0, 0.0, 0.0), intensity);
        FragColor = vec4(lensColor, 1.0);

    }
    else{
                // Background color (e.g., starfield)
      FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    
    }
}
