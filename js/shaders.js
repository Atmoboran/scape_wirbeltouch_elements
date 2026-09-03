// All GLSL programs of the fluid solver.
//
// Convention used everywhere in this app:
//   * velocity is stored in "simulation texels per second"
//   * the obstacle mask stores 1.0 = solid (obstacle), 0.0 = free fluid
//   * uv (0,0) is the bottom left corner of the domain

export const baseVertexShader = `
precision highp float;
attribute vec2 aPosition;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform vec2 texelSize;

void main () {
    vUv = aPosition * 0.5 + 0.5;
    vL = vUv - vec2(texelSize.x, 0.0);
    vR = vUv + vec2(texelSize.x, 0.0);
    vT = vUv + vec2(0.0, texelSize.y);
    vB = vUv - vec2(0.0, texelSize.y);
    gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

export const clearShader = `
precision mediump float;
precision mediump sampler2D;
varying highp vec2 vUv;
uniform sampler2D uTexture;
uniform float value;

void main () {
    gl_FragColor = value * texture2D(uTexture, vUv);
}
`;

// Adds a gaussian blob of "color" (dye rgb or a velocity impulse) around point.
export const splatShader = `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
uniform sampler2D uTarget;
uniform sampler2D uObstacles;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform float radius;

void main () {
    vec2 p = vUv - point.xy;
    p.x *= aspectRatio;
    vec3 splat = exp(-dot(p, p) / radius) * color;
    vec3 base = texture2D(uTarget, vUv).xyz;
    float solid = step(0.5, texture2D(uObstacles, vUv).x);
    gl_FragColor = vec4((base + splat) * (1.0 - solid), 1.0);
}
`;

// Semi-lagrangian advection. Everything inside an obstacle is wiped, which
// gives a no-slip boundary for the velocity field and keeps dye out of solids.
export const advectionShader = `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform sampler2D uObstacles;
uniform vec2 texelSize;
uniform float dt;
uniform float dissipation;

void main () {
    float solid = step(0.5, texture2D(uObstacles, vUv).x);
    vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
    coord = clamp(coord, vec2(0.0), vec2(1.0));
    vec4 result = texture2D(uSource, coord);
    float decay = 1.0 + dissipation * dt;
    gl_FragColor = (result / decay) * (1.0 - solid);
}
`;

// Divergence of the velocity field.
//   * domain walls  : reflected (closed) or transparent (along the flow axis)
//   * obstacle walls: reflected -> zero normal velocity on the solid face
export const divergenceShader = `
precision mediump float;
precision mediump sampler2D;
varying highp vec2 vUv;
varying highp vec2 vL;
varying highp vec2 vR;
varying highp vec2 vT;
varying highp vec2 vB;
uniform sampler2D uVelocity;
uniform sampler2D uObstacles;
uniform vec2 uFlow;

void main () {
    vec2 C = texture2D(uVelocity, vUv).xy;
    float L = texture2D(uVelocity, vL).x;
    float R = texture2D(uVelocity, vR).x;
    float T = texture2D(uVelocity, vT).y;
    float B = texture2D(uVelocity, vB).y;

    // the two walls the flow runs through are transparent, the other two are
    // solid tunnel walls; with the wind off the box is closed on all sides
    bool openH = abs(uFlow.x) > 0.5;
    bool openV = abs(uFlow.y) > 0.5;
    if (vL.x < 0.0) L = openH ? C.x : -C.x;
    if (vR.x > 1.0) R = openH ? C.x : -C.x;
    if (vT.y > 1.0) T = openV ? C.y : -C.y;
    if (vB.y < 0.0) B = openV ? C.y : -C.y;

    if (texture2D(uObstacles, vL).x > 0.5) L = -C.x;
    if (texture2D(uObstacles, vR).x > 0.5) R = -C.x;
    if (texture2D(uObstacles, vT).x > 0.5) T = -C.y;
    if (texture2D(uObstacles, vB).x > 0.5) B = -C.y;

    float solid = step(0.5, texture2D(uObstacles, vUv).x);
    float div = 0.5 * (R - L + T - B);
    gl_FragColor = vec4(div * (1.0 - solid), 0.0, 0.0, 1.0);
}
`;

export const curlShader = `
precision mediump float;
precision mediump sampler2D;
varying highp vec2 vUv;
varying highp vec2 vL;
varying highp vec2 vR;
varying highp vec2 vT;
varying highp vec2 vB;
uniform sampler2D uVelocity;

void main () {
    float L = texture2D(uVelocity, vL).y;
    float R = texture2D(uVelocity, vR).y;
    float T = texture2D(uVelocity, vT).x;
    float B = texture2D(uVelocity, vB).x;
    float vorticity = 0.5 * (R - L - T + B);
    gl_FragColor = vec4(vorticity, 0.0, 0.0, 1.0);
}
`;

// Vorticity confinement: pushes energy back into eddies that the coarse grid
// would otherwise smear away.
export const vorticityShader = `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform sampler2D uObstacles;
uniform float curl;
uniform float dt;

void main () {
    float L = texture2D(uCurl, vL).x;
    float R = texture2D(uCurl, vR).x;
    float T = texture2D(uCurl, vT).x;
    float B = texture2D(uCurl, vB).x;
    float C = texture2D(uCurl, vUv).x;

    vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
    force /= length(force) + 0.0001;
    // normalising the gradient would otherwise turn single-cell noise into a
    // full strength kick, so weak vorticity is faded out
    force *= curl * C * smoothstep(0.0, 1.2, abs(C));
    force.y *= -1.0;

    vec2 velocity = texture2D(uVelocity, vUv).xy;
    velocity += force * dt;
    velocity = min(max(velocity, -3000.0), 3000.0);

    float solid = step(0.5, texture2D(uObstacles, vUv).x);
    gl_FragColor = vec4(velocity * (1.0 - solid), 0.0, 1.0);
}
`;

// Jacobi iteration for the pressure poisson equation.
// Solid cells and closed walls get a Neumann condition (p_neighbour = p_centre);
// in wind tunnel mode the outflow column is pinned to p = 0 so air can leave.
export const pressureShader = `
precision mediump float;
precision mediump sampler2D;
varying highp vec2 vUv;
varying highp vec2 vL;
varying highp vec2 vR;
varying highp vec2 vT;
varying highp vec2 vB;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform sampler2D uObstacles;
uniform vec2 uFlow;

void main () {
    // pinning the outlet to p = 0 is what lets the air leave the domain
    bool outlet = (uFlow.x > 0.5 && vR.x > 1.0) || (uFlow.x < -0.5 && vL.x < 0.0)
               || (uFlow.y > 0.5 && vT.y > 1.0) || (uFlow.y < -0.5 && vB.y < 0.0);
    if (outlet) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    float C = texture2D(uPressure, vUv).x;
    float L = texture2D(uPressure, vL).x;
    float R = texture2D(uPressure, vR).x;
    float T = texture2D(uPressure, vT).x;
    float B = texture2D(uPressure, vB).x;

    if (texture2D(uObstacles, vL).x > 0.5) L = C;
    if (texture2D(uObstacles, vR).x > 0.5) R = C;
    if (texture2D(uObstacles, vT).x > 0.5) T = C;
    if (texture2D(uObstacles, vB).x > 0.5) B = C;

    float divergence = texture2D(uDivergence, vUv).x;
    float pressure = (L + R + B + T - divergence) * 0.25;
    gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
}
`;

export const gradientSubtractShader = `
precision mediump float;
precision mediump sampler2D;
varying highp vec2 vUv;
varying highp vec2 vL;
varying highp vec2 vR;
varying highp vec2 vT;
varying highp vec2 vB;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform sampler2D uObstacles;
uniform vec2 uFlow;

void main () {
    float C = texture2D(uPressure, vUv).x;
    float L = texture2D(uPressure, vL).x;
    float R = texture2D(uPressure, vR).x;
    float T = texture2D(uPressure, vT).x;
    float B = texture2D(uPressure, vB).x;

    if (texture2D(uObstacles, vL).x > 0.5) L = C;
    if (texture2D(uObstacles, vR).x > 0.5) R = C;
    if (texture2D(uObstacles, vT).x > 0.5) T = C;
    if (texture2D(uObstacles, vB).x > 0.5) B = C;
    if (uFlow.x > 0.5 && vR.x > 1.0) R = 0.0;
    if (uFlow.x < -0.5 && vL.x < 0.0) L = 0.0;
    if (uFlow.y > 0.5 && vT.y > 1.0) T = 0.0;
    if (uFlow.y < -0.5 && vB.y < 0.0) B = 0.0;

    vec2 velocity = texture2D(uVelocity, vUv).xy;
    velocity -= 0.5 * vec2(R - L, T - B);

    float solid = step(0.5, texture2D(uObstacles, vUv).x);
    gl_FragColor = vec4(velocity * (1.0 - solid), 0.0, 1.0);
}
`;

// Wind tunnel forcing: strong nudge towards the free stream in a band at the
// inlet, plus a weak sponge near the outlet that swallows reflections.
export const inflowShader = `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uObstacles;
uniform vec2 uDir;
uniform float uSpeed;
uniform float uBand;
uniform float uInletStrength;
uniform float uSpongeStrength;
uniform float uTime;
uniform float uWobble;

void main () {
    vec2 v = texture2D(uVelocity, vUv).xy;
    vec2 perp = vec2(-uDir.y, uDir.x);
    // s runs 0 at the inlet edge to 1 at the outlet edge, whatever the direction
    float s = dot(vUv - vec2(0.5), uDir) + 0.5;
    float inlet = smoothstep(uBand, 0.0, s) * uInletStrength;
    float sponge = smoothstep(1.0 - uBand * 2.0, 1.0, s) * uSpongeStrength;
    float w = clamp(max(inlet, sponge), 0.0, 1.0);
    float wobble = uWobble * uSpeed * sin(uTime * 1.7 + dot(vUv, perp) * 11.0);
    v = mix(v, uSpeed * uDir + wobble * perp, w);
    float solid = step(0.5, texture2D(uObstacles, vUv).x);
    gl_FragColor = vec4(v * (1.0 - solid), 0.0, 1.0);
}
`;

// Continuous dye source at the inlet: either horizontal smoke lines (great for
// following streamlines around an obstacle) or a solid sheet of smoke.
export const injectShader = `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
uniform sampler2D uTarget;
uniform sampler2D uObstacles;
uniform vec2 uDir;
uniform float uBand;
uniform float uStripes;
uniform float uAmount;
uniform float uMode;
uniform vec3 uColorA;
uniform vec3 uColorB;

void main () {
    vec3 base = texture2D(uTarget, vUv).rgb;
    vec2 perp = vec2(-uDir.y, uDir.x);
    float band = smoothstep(uBand, 0.0, dot(vUv - vec2(0.5), uDir) + 0.5);
    float across = fract(dot(vUv, perp) + 1.0);
    float s = 1.0;
    if (uMode < 0.5) {
        float f = fract(across * uStripes);
        s = 1.0 - smoothstep(0.10, 0.24, abs(f - 0.5));
    }
    vec3 col = mix(uColorA, uColorB, across);
    float solid = step(0.5, texture2D(uObstacles, vUv).x);
    float k = clamp(s * band * uAmount, 0.0, 1.0);
    vec3 c = mix(base, col, k);
    gl_FragColor = vec4(c * (1.0 - solid), 1.0);
}
`;

// Final image. Four ways of looking at the same flow.
export const displayShader = `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
uniform sampler2D uTexture;
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform sampler2D uPressure;
uniform sampler2D uObstacles;
uniform vec2 uSimTexel;
uniform float uMode;
uniform float uSpeedScale;
uniform float uCurlScale;
uniform float uPressureScale;

// The pressure solve lives on a collocated grid, which lets a little
// checkerboard noise through. It is invisible in the smoke, but it would
// speckle the diagnostic views, so those get a 5-tap smoothing.
vec4 smooth5 (sampler2D tex, vec2 uv) {
    vec2 e = uSimTexel * 1.5;
    vec4 v = texture2D(tex, uv) * 0.20;
    v += texture2D(tex, uv + vec2(e.x, 0.0)) * 0.12;
    v += texture2D(tex, uv - vec2(e.x, 0.0)) * 0.12;
    v += texture2D(tex, uv + vec2(0.0, e.y)) * 0.12;
    v += texture2D(tex, uv - vec2(0.0, e.y)) * 0.12;
    v += texture2D(tex, uv + e) * 0.08;
    v += texture2D(tex, uv - e) * 0.08;
    v += texture2D(tex, uv + vec2(e.x, -e.y)) * 0.08;
    v += texture2D(tex, uv + vec2(-e.x, e.y)) * 0.08;
    return v;
}

vec3 sequential (float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 c0 = vec3(0.02, 0.05, 0.14);
    vec3 c1 = vec3(0.09, 0.36, 0.55);
    vec3 c2 = vec3(0.20, 0.72, 0.62);
    vec3 c3 = vec3(0.96, 0.83, 0.32);
    vec3 c4 = vec3(0.98, 0.42, 0.24);
    if (t < 0.25) return mix(c0, c1, t / 0.25);
    if (t < 0.50) return mix(c1, c2, (t - 0.25) / 0.25);
    if (t < 0.75) return mix(c2, c3, (t - 0.50) / 0.25);
    return mix(c3, c4, (t - 0.75) / 0.25);
}

vec3 diverging (float t) {
    t = clamp(t * 0.5 + 0.5, 0.0, 1.0);
    vec3 lo = vec3(0.38, 0.72, 1.00);
    vec3 mid = vec3(0.04, 0.06, 0.10);
    vec3 hi = vec3(1.00, 0.45, 0.28);
    if (t < 0.5) return mix(lo, mid, t / 0.5);
    return mix(mid, hi, (t - 0.5) / 0.5);
}

void main () {
    vec3 c;
    if (uMode < 0.5) {
        c = texture2D(uTexture, vUv).rgb;
    } else if (uMode < 1.5) {
        float speed = length(smooth5(uVelocity, vUv).xy) * uSpeedScale;
        c = sequential(speed);
    } else if (uMode < 2.5) {
        float w = smooth5(uCurl, vUv).x * uCurlScale;
        c = diverging(w);
    } else {
        float p = smooth5(uPressure, vUv).x * uPressureScale;
        c = diverging(p);
    }
    float solid = step(0.5, texture2D(uObstacles, vUv).x);
    c = mix(c, vec3(0.0), solid);
    gl_FragColor = vec4(c, 1.0);
}
`;
