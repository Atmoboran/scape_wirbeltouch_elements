// Incompressible 2D Navier-Stokes solver on the GPU (Stam's stable fluids):
// advect -> vorticity confinement -> project (Jacobi pressure solve).
// Everything runs in fragment shaders, so all the number crunching happens in
// the visitor's own browser - no server involved.

import {
    createGLContext, compileShader, Program, createBlitter,
    createFBO, createDoubleFBO, createCanvasTexture
} from './gl.js';
import * as S from './shaders.js';

export const defaultConfig = {
    SIM_RESOLUTION: 256,
    DYE_RESOLUTION: 1024,
    MASK_SCALE: 2,
    PRESSURE_ITERATIONS: 32,
    PRESSURE_DECAY: 0.85,
    DENSITY_DISSIPATION: 0,
    VELOCITY_DISSIPATION: 0.15,
    CURL: 8,
    SPLAT_RADIUS: 0.22,
    SPLAT_FORCE: 5000,
    // wind tunnel
    windTunnel: false,
    windSpeed: 55,          // simulation texels per second
    windDir: [1, 0],        // unit vector, uv space (y up): [1,0] = left to right
    inflowWobble: 0.02,     // tiny inlet unsteadiness, seeds vortex shedding
    inflowBand: 0.05,
    inletStrength: 0.85,
    spongeStrength: 0.06,
    smokeMode: 0,           // 0 = streak lines, 1 = full smoke
    smokeStripes: 22,
    smokeRate: 1.6,
    smokeColorA: [0.25, 0.75, 1.0],
    smokeColorB: [1.0, 0.55, 0.25],
    // rendering
    displayMode: 0,         // 0 dye, 1 speed, 2 vorticity, 3 pressure
    speedScale: 0.012,
    curlScale: 0.09,
    pressureScale: 0.6,
    paused: false
};

export class FluidSimulation {
    constructor (canvas, obstacleField, config = {}) {
        this.canvas = canvas;
        this.obstacles = obstacleField;
        this.config = Object.assign({}, defaultConfig, config);

        const { gl, ext, isWebGL2 } = createGLContext(canvas);
        this.gl = gl;
        this.ext = ext;
        this.isWebGL2 = isWebGL2;

        const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
        this.filtering = filtering;

        const vs = compileShader(gl, gl.VERTEX_SHADER, S.baseVertexShader);
        this.programs = {
            clear: new Program(gl, vs, S.clearShader),
            splat: new Program(gl, vs, S.splatShader),
            advection: new Program(gl, vs, S.advectionShader),
            divergence: new Program(gl, vs, S.divergenceShader),
            curl: new Program(gl, vs, S.curlShader),
            vorticity: new Program(gl, vs, S.vorticityShader),
            pressure: new Program(gl, vs, S.pressureShader),
            gradient: new Program(gl, vs, S.gradientSubtractShader),
            inflow: new Program(gl, vs, S.inflowShader),
            inject: new Program(gl, vs, S.injectShader),
            display: new Program(gl, vs, S.displayShader)
        };

        this.time = 0;
        this.blit = createBlitter(gl);
        this.obstacleTexture = createCanvasTexture(gl, this.obstacles.maskCanvas);
        this.initFramebuffers();
    }

    getResolution (resolution) {
        const gl = this.gl;
        let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
        if (aspectRatio < 1) aspectRatio = 1.0 / aspectRatio;
        const min = Math.round(resolution);
        const max = Math.round(resolution * aspectRatio);
        if (gl.drawingBufferWidth > gl.drawingBufferHeight) return { width: max, height: min };
        return { width: min, height: max };
    }

    initFramebuffers () {
        const gl = this.gl;
        const ext = this.ext;
        const simRes = this.getResolution(this.config.SIM_RESOLUTION);
        const dyeRes = this.getResolution(this.config.DYE_RESOLUTION);
        const texType = ext.halfFloatTexType;
        const rgba = ext.formatRGBA;
        const rg = ext.formatRG;
        const r = ext.formatR;
        const filtering = this.filtering;

        this.simWidth = simRes.width;
        this.simHeight = simRes.height;

        gl.disable(gl.BLEND);

        this.dye = createDoubleFBO(gl, dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
        this.velocity = createDoubleFBO(gl, simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);
        this.divergence = createFBO(gl, simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
        this.curl = createFBO(gl, simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
        this.pressure = createDoubleFBO(gl, simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);

        this.obstacles.resizeMask(
            Math.round(simRes.width * this.config.MASK_SCALE),
            Math.round(simRes.height * this.config.MASK_SCALE)
        );
        this.syncObstacles(true);
    }

    syncObstacles (force = false) {
        if (!force && !this.obstacles.dirty) return;
        this.obstacles.renderMask();
        this.obstacleTexture.update();
    }

    reset () {
        const gl = this.gl;
        for (const target of [this.dye, this.velocity, this.pressure]) {
            for (const fbo of [target.read, target.write]) {
                gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.fbo);
                gl.viewport(0, 0, fbo.width, fbo.height);
                gl.clearColor(0, 0, 0, 1);
                gl.clear(gl.COLOR_BUFFER_BIT);
            }
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    step (dt) {
        this.time += dt;
        const gl = this.gl;
        const c = this.config;
        const P = this.programs;
        const velocity = this.velocity;
        const obst = this.obstacleTexture;
        // (0,0) closes every wall; otherwise the flow axis opens up
        const flowX = c.windTunnel ? c.windDir[0] : 0;
        const flowY = c.windTunnel ? c.windDir[1] : 0;

        gl.disable(gl.BLEND);

        // ---- wind tunnel forcing -------------------------------------------
        if (c.windTunnel) {
            P.inflow.bind();
            gl.uniform2f(P.inflow.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
            gl.uniform1i(P.inflow.uniforms.uVelocity, velocity.read.attach(0));
            gl.uniform1i(P.inflow.uniforms.uObstacles, obst.attach(1));
            gl.uniform2f(P.inflow.uniforms.uDir, c.windDir[0], c.windDir[1]);
            gl.uniform1f(P.inflow.uniforms.uSpeed, c.windSpeed);
            gl.uniform1f(P.inflow.uniforms.uBand, c.inflowBand);
            gl.uniform1f(P.inflow.uniforms.uInletStrength, Math.min(1.0, c.inletStrength));
            gl.uniform1f(P.inflow.uniforms.uSpongeStrength, c.spongeStrength);
            gl.uniform1f(P.inflow.uniforms.uWobble, c.inflowWobble);
            gl.uniform1f(P.inflow.uniforms.uTime, this.time);
            this.blit(velocity.write);
            velocity.swap();
        }

        // ---- vorticity ------------------------------------------------------
        P.curl.bind();
        gl.uniform2f(P.curl.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
        gl.uniform1i(P.curl.uniforms.uVelocity, velocity.read.attach(0));
        this.blit(this.curl);

        if (c.CURL > 0) {
            P.vorticity.bind();
            gl.uniform2f(P.vorticity.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
            gl.uniform1i(P.vorticity.uniforms.uVelocity, velocity.read.attach(0));
            gl.uniform1i(P.vorticity.uniforms.uCurl, this.curl.attach(1));
            gl.uniform1i(P.vorticity.uniforms.uObstacles, obst.attach(2));
            gl.uniform1f(P.vorticity.uniforms.curl, c.CURL);
            gl.uniform1f(P.vorticity.uniforms.dt, dt);
            this.blit(velocity.write);
            velocity.swap();
        }

        // ---- projection ------------------------------------------------------
        P.divergence.bind();
        gl.uniform2f(P.divergence.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
        gl.uniform1i(P.divergence.uniforms.uVelocity, velocity.read.attach(0));
        gl.uniform1i(P.divergence.uniforms.uObstacles, obst.attach(1));
        gl.uniform2f(P.divergence.uniforms.uFlow, flowX, flowY);
        this.blit(this.divergence);

        P.clear.bind();
        gl.uniform2f(P.clear.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
        gl.uniform1i(P.clear.uniforms.uTexture, this.pressure.read.attach(0));
        gl.uniform1f(P.clear.uniforms.value, c.PRESSURE_DECAY);
        this.blit(this.pressure.write);
        this.pressure.swap();

        P.pressure.bind();
        gl.uniform2f(P.pressure.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
        gl.uniform1i(P.pressure.uniforms.uDivergence, this.divergence.attach(0));
        gl.uniform1i(P.pressure.uniforms.uObstacles, obst.attach(1));
        gl.uniform2f(P.pressure.uniforms.uFlow, flowX, flowY);
        for (let i = 0; i < c.PRESSURE_ITERATIONS; i++) {
            gl.uniform1i(P.pressure.uniforms.uPressure, this.pressure.read.attach(2));
            this.blit(this.pressure.write);
            this.pressure.swap();
        }

        P.gradient.bind();
        gl.uniform2f(P.gradient.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
        gl.uniform1i(P.gradient.uniforms.uPressure, this.pressure.read.attach(0));
        gl.uniform1i(P.gradient.uniforms.uVelocity, velocity.read.attach(1));
        gl.uniform1i(P.gradient.uniforms.uObstacles, obst.attach(2));
        gl.uniform2f(P.gradient.uniforms.uFlow, flowX, flowY);
        this.blit(velocity.write);
        velocity.swap();

        // ---- advection --------------------------------------------------------
        P.advection.bind();
        gl.uniform2f(P.advection.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
        gl.uniform1i(P.advection.uniforms.uVelocity, velocity.read.attach(0));
        gl.uniform1i(P.advection.uniforms.uSource, velocity.read.attach(0));
        gl.uniform1i(P.advection.uniforms.uObstacles, obst.attach(1));
        gl.uniform1f(P.advection.uniforms.dt, dt);
        gl.uniform1f(P.advection.uniforms.dissipation, c.VELOCITY_DISSIPATION);
        this.blit(velocity.write);
        velocity.swap();

        gl.uniform1i(P.advection.uniforms.uVelocity, velocity.read.attach(0));
        gl.uniform1i(P.advection.uniforms.uSource, this.dye.read.attach(2));
        gl.uniform1i(P.advection.uniforms.uObstacles, obst.attach(1));
        gl.uniform1f(P.advection.uniforms.dissipation, c.DENSITY_DISSIPATION);
        this.blit(this.dye.write);
        this.dye.swap();

        // ---- smoke source at the inlet ----------------------------------------
        if (c.windTunnel && c.smokeRate > 0) {
            P.inject.bind();
            gl.uniform2f(P.inject.uniforms.texelSize, this.dye.texelSizeX, this.dye.texelSizeY);
            gl.uniform1i(P.inject.uniforms.uTarget, this.dye.read.attach(0));
            gl.uniform1i(P.inject.uniforms.uObstacles, obst.attach(1));
            gl.uniform2f(P.inject.uniforms.uDir, c.windDir[0], c.windDir[1]);
            gl.uniform1f(P.inject.uniforms.uBand, c.inflowBand * 0.6);
            gl.uniform1f(P.inject.uniforms.uStripes, c.smokeStripes);
            gl.uniform1f(P.inject.uniforms.uAmount, Math.min(1.0, c.smokeRate * dt * 8.0));
            gl.uniform1f(P.inject.uniforms.uMode, c.smokeMode);
            gl.uniform3f(P.inject.uniforms.uColorA, c.smokeColorA[0], c.smokeColorA[1], c.smokeColorA[2]);
            gl.uniform3f(P.inject.uniforms.uColorB, c.smokeColorB[0], c.smokeColorB[1], c.smokeColorB[2]);
            this.blit(this.dye.write);
            this.dye.swap();
        }
    }

    // x, y in [0,1] with y pointing up; dx, dy are velocity impulses.
    splat (x, y, dx, dy, color) {
        const gl = this.gl;
        const P = this.programs;
        const obst = this.obstacleTexture;

        P.splat.bind();
        gl.uniform2f(P.splat.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
        gl.uniform1i(P.splat.uniforms.uTarget, this.velocity.read.attach(0));
        gl.uniform1i(P.splat.uniforms.uObstacles, obst.attach(1));
        gl.uniform1f(P.splat.uniforms.aspectRatio, this.canvas.width / this.canvas.height);
        gl.uniform2f(P.splat.uniforms.point, x, y);
        gl.uniform3f(P.splat.uniforms.color, dx, dy, 0.0);
        gl.uniform1f(P.splat.uniforms.radius, this.correctRadius(this.config.SPLAT_RADIUS / 100.0));
        this.blit(this.velocity.write);
        this.velocity.swap();

        if (color) {
            gl.uniform2f(P.splat.uniforms.texelSize, this.dye.texelSizeX, this.dye.texelSizeY);
            gl.uniform1i(P.splat.uniforms.uTarget, this.dye.read.attach(0));
            gl.uniform3f(P.splat.uniforms.color, color[0], color[1], color[2]);
            this.blit(this.dye.write);
            this.dye.swap();
        }
    }

    correctRadius (radius) {
        const aspectRatio = this.canvas.width / this.canvas.height;
        if (aspectRatio > 1) radius *= aspectRatio;
        return radius;
    }

    render () {
        const gl = this.gl;
        const c = this.config;
        const P = this.programs;
        gl.disable(gl.BLEND);
        P.display.bind();
        gl.uniform2f(P.display.uniforms.texelSize, this.dye.texelSizeX, this.dye.texelSizeY);
        gl.uniform1i(P.display.uniforms.uTexture, this.dye.read.attach(0));
        gl.uniform1i(P.display.uniforms.uVelocity, this.velocity.read.attach(1));
        gl.uniform1i(P.display.uniforms.uCurl, this.curl.attach(2));
        gl.uniform1i(P.display.uniforms.uPressure, this.pressure.read.attach(3));
        gl.uniform1i(P.display.uniforms.uObstacles, this.obstacleTexture.attach(4));
        gl.uniform2f(P.display.uniforms.uSimTexel, this.velocity.texelSizeX, this.velocity.texelSizeY);
        gl.uniform1f(P.display.uniforms.uMode, c.displayMode);
        gl.uniform1f(P.display.uniforms.uSpeedScale, c.speedScale);
        gl.uniform1f(P.display.uniforms.uCurlScale, c.curlScale);
        gl.uniform1f(P.display.uniforms.uPressureScale, c.pressureScale);
        this.blit(null);
    }
}
