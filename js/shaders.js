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
    float solid = smoothstep(0.28, 0.72, texture2D(uObstacles, vUv).x);
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
    float solid = smoothstep(0.28, 0.72, texture2D(uObstacles, vUv).x);
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
    if (texture2D(uObstacles, vUv).x > 0.5) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    // The stored velocity is read as a MAC arrangement: x is the flux through
    // the cell's LEFT face, y through its BOTTOM face. With the backward
    // difference in the gradient step this makes div(grad(p)) exactly the five
    // point Laplacian that the pressure solve inverts. With central
    // differences on both (the collocated form) it is the Laplacian of spacing
    // two instead, the projection is then correcting a different equation than
    // it solves, and no number of iterations can drive the divergence to zero -
    // which is what let air pour endlessly into a room with a single opening.
    vec2 C = texture2D(uVelocity, vUv).xy;
    float west = C.x;
    float east = texture2D(uVelocity, vR).x;
    float south = C.y;
    float north = texture2D(uVelocity, vT).y;

    // a face against a solid carries no flux
    if (texture2D(uObstacles, vL).x > 0.5) west = 0.0;
    if (texture2D(uObstacles, vR).x > 0.5) east = 0.0;
    if (texture2D(uObstacles, vB).x > 0.5) south = 0.0;
    if (texture2D(uObstacles, vT).x > 0.5) north = 0.0;

    // domain walls: closed unless the flow runs through them
    bool openH = abs(uFlow.x) > 0.5;
    bool openV = abs(uFlow.y) > 0.5;
    if (vL.x < 0.0 && !openH) west = 0.0;
    if (vR.x > 1.0 && !openH) east = 0.0;
    if (vB.y < 0.0 && !openV) south = 0.0;
    if (vT.y > 1.0 && !openV) north = 0.0;

    gl_FragColor = vec4((east - west) + (north - south), 0.0, 0.0, 1.0);
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

    float solid = smoothstep(0.28, 0.72, texture2D(uObstacles, vUv).x);
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
    // backward difference, the partner of the forward difference used for the
    // divergence - see the note there
    float pC = texture2D(uPressure, vUv).x;
    float pW = texture2D(uPressure, vL).x;
    float pS = texture2D(uPressure, vB).x;

    vec2 velocity = texture2D(uVelocity, vUv).xy;
    velocity -= vec2(pC - pW, pC - pS);

    bool solidC = texture2D(uObstacles, vUv).x > 0.5;
    bool solidW = texture2D(uObstacles, vL).x > 0.5;
    bool solidS = texture2D(uObstacles, vB).x > 0.5;
    bool openH = abs(uFlow.x) > 0.5;
    bool openV = abs(uFlow.y) > 0.5;

    // no flux through a face that touches a solid, or through a closed wall
    if (solidC || solidW) velocity.x = 0.0;
    if (solidC || solidS) velocity.y = 0.0;
    if (vL.x < 0.0 && !openH) velocity.x = 0.0;
    if (vB.y < 0.0 && !openV) velocity.y = 0.0;
    if (solidC) velocity = vec2(0.0);

    gl_FragColor = vec4(velocity, 0.0, 1.0);
}
`;

// Fills the whole field with one value (outside solids). Used to prime the
// tunnel: without it the domain starts at rest and the smoke front travels as
// a shear layer that curls up long before it reaches any obstacle.
export const fillShader = `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
uniform sampler2D uObstacles;
uniform vec2 uValue;

void main () {
    float solid = smoothstep(0.28, 0.72, texture2D(uObstacles, vUv).x);
    gl_FragColor = vec4(uValue * (1.0 - solid), 0.0, 1.0);
}
`;

// ---------------------------------------------------------------------------
// Coarse grid correction for the pressure solve.
//
// Jacobi is a smoother: it flattens short wavelength error fast and long
// wavelength error at O(N^2) sweeps. The mass balance of a room is exactly a
// long wavelength constraint - the pressure inside has to rise until it stops
// the inflow - so 32 sweeps never get there and air keeps pouring through a
// single opening. Solving the residual equation on a 4x coarser grid costs a
// sixteenth per sweep and moves information four times further, which is what
// makes a room with one window fill up and then stall, the way a real one does.

// r = div - laplacian(p), the part of the equation the smoother has not solved
export const residualShader = `
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
    bool outlet = (uFlow.x > 0.5 && vR.x > 1.0) || (uFlow.x < -0.5 && vL.x < 0.0)
               || (uFlow.y > 0.5 && vT.y > 1.0) || (uFlow.y < -0.5 && vB.y < 0.0);
    if (outlet || texture2D(uObstacles, vUv).x > 0.5) {
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

    float lap = L + R + T + B - 4.0 * C;
    gl_FragColor = vec4(texture2D(uDivergence, vUv).x - lap, 0.0, 0.0, 1.0);
}
`;

// average the residual onto the coarse grid; uScale carries the (h_c/h_f)^2
// factor the coarse Laplacian needs
export const restrictShader = `
precision mediump float;
precision mediump sampler2D;
varying highp vec2 vUv;
uniform sampler2D uResidual;
uniform vec2 uFineTexel;
uniform float uScale;

void main () {
    vec2 e = uFineTexel;
    float r = texture2D(uResidual, vUv + vec2(-e.x, -e.y)).x
            + texture2D(uResidual, vUv + vec2( e.x, -e.y)).x
            + texture2D(uResidual, vUv + vec2(-e.x,  e.y)).x
            + texture2D(uResidual, vUv + vec2( e.x,  e.y)).x;
    gl_FragColor = vec4(r * 0.25 * uScale, 0.0, 0.0, 1.0);
}
`;

// add the interpolated coarse correction back onto the fine pressure
export const prolongShader = `
precision mediump float;
precision mediump sampler2D;
varying highp vec2 vUv;
uniform sampler2D uPressure;
uniform sampler2D uCoarse;
uniform sampler2D uObstacles;

void main () {
    float p = texture2D(uPressure, vUv).x;
    float e = texture2D(uCoarse, vUv).x;
    if (texture2D(uObstacles, vUv).x > 0.5) e = 0.0;
    gl_FragColor = vec4(p + e, 0.0, 0.0, 1.0);
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
    float solid = smoothstep(0.28, 0.72, texture2D(uObstacles, vUv).x);
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
    float solid = smoothstep(0.28, 0.72, texture2D(uObstacles, vUv).x);
    c = mix(c, vec3(0.0), solid);
    gl_FragColor = vec4(c, 1.0);
}
`;
