// Incompressible 2D Navier-Stokes solver on the GPU (Stam's stable fluids):
// advect -> vorticity confinement -> project (Jacobi pressure solve).
// Everything runs in fragment shaders, so all the number crunching happens in
// the visitor's own browser - no server involved.

import {
    createGLContext, compileShader, Program, createBlitter,
    createFBO, createDoubleFBO, createCanvasTexture
} from './gl.js';
import * as S from './shaders.js';

const MAX_DEVICES = 8;      // as many as the device shaders loop over
const MAX_SINKS = 4;

function packSinks (list) {
    const out = new Float32Array(MAX_SINKS * 4);
    out.set(list.slice(0, MAX_SINKS * 4));
    return out;
}

export const defaultConfig = {
    SIM_RESOLUTION: 256,
    DYE_RESOLUTION: 1024,
    MASK_SCALE: 2,
    PRESSURE_ITERATIONS: 32,
    COARSE_SCALE: 4,            // coarse grid for the pressure correction
    COARSE_ITERATIONS: 40,      // cheap: one sweep costs a sixteenth of a fine one
    // No artificial decay of the pressure field. 0.85 (as the demos this grew
    // out of use) caps how large the pressure can ever get, and the pressure
    // inside a room with one opening has to grow large to stop the inflow.
    PRESSURE_DECAY: 1.0,
    DENSITY_DISSIPATION: 0.12,
    VELOCITY_DISSIPATION: 0.09,
    CURL: 6,
    SPLAT_RADIUS: 0.22,
    SPLAT_FORCE: 5000,
    // wind tunnel
    windTunnel: false,
    windSpeed: 50,          // simulation texels per second
    windDir: [1, 0],        // unit vector, uv space (y up): [1,0] = left to right
    windGain: 1,            // fan speed: ramped to 0 when the wind is switched off
    windDecay: 0,           // 1/s, a uniform slow-down of the whole field while
                            // the fan runs out
    inflowWobble: 0.02,     // tiny inlet unsteadiness, seeds vortex shedding
    inflowBand: 0.05,
    inletStrength: 0.85,
    spongeStrength: 0.06,
    smokeMode: 0,           // 0 = streak lines, 1 = full smoke
    smokeStripes: 22,
    smokeRate: 1.6,
    // Colours are rgb triples in 0..1. These are plain stand-ins - the app
    // fills them in from the active theme.
    smokeColorA: [1, 1, 1],
    smokeColorB: [1, 1, 1],
    // devices, speeds as multiples of the wind speed
    fanSpeed: 1.8,          // air in a fan's duct
    rotorSpeed: 2.0,        // a rotor's surface; above 2 a Flettner rotor
                            // makes most of its lift
    chimneySpeed: 0.8,      // exhaust leaving the stack
    sinkSpeed: 1.2,         // air at the rim of a suction vent
    deviceSmokeColor: [0.3, 0.3, 0.3],
    // rendering
    displayMode: 0,         // 0 dye, 1 speed, 2 vorticity, 3 pressure
    speedScale: 0.012,
    curlScale: 0.09,
    pressureScale: 0.6,
    backgroundColor: [0, 0, 0],
    solidColor: [0, 0, 0],
    speedColormap: [[0, 0, 0], [0.25, 0.25, 0.25], [0.5, 0.5, 0.5], [0.75, 0.75, 0.75], [1, 1, 1]],
    divergingColormap: [[0, 0, 1], [0, 0, 0], [1, 0, 0]],
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
            fill: new Program(gl, vs, S.fillShader),
            residual: new Program(gl, vs, S.residualShader),
            restrict: new Program(gl, vs, S.restrictShader),
            prolong: new Program(gl, vs, S.prolongShader),
            inflow: new Program(gl, vs, S.inflowShader),
            inject: new Program(gl, vs, S.injectShader),
            drive: new Program(gl, vs, S.driveShader),
            deviceDye: new Program(gl, vs, S.deviceDyeShader),
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
        this.clearTarget(this.dye);     // new buffers come up opaque: no smoke means alpha 0
        this.velocity = createDoubleFBO(gl, simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);
        this.divergence = createFBO(gl, simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
        this.curl = createFBO(gl, simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
        this.pressure = createDoubleFBO(gl, simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
        this.residual = createFBO(gl, simRes.width, simRes.height, r.internalFormat, r.format, texType, filtering);
        const cw = Math.max(4, Math.floor(simRes.width / this.config.COARSE_SCALE));
        const ch = Math.max(4, Math.floor(simRes.height / this.config.COARSE_SCALE));
        this.coarseResidual = createFBO(gl, cw, ch, r.internalFormat, r.format, texType, gl.NEAREST);
        this.coarsePressure = createDoubleFBO(gl, cw, ch, r.internalFormat, r.format, texType, filtering);

        this.obstacles.resizeMask(
            Math.round(simRes.width * this.config.MASK_SCALE),
            Math.round(simRes.height * this.config.MASK_SCALE)
        );
        // ramp the boundary over roughly one simulation cell
        this.obstacles.edgeBlur = this.config.MASK_SCALE;
        this.syncObstacles(true);
    }

    syncObstacles (force = false) {
        if (!force && !this.obstacles.dirty) return;
        this.obstacles.renderMask();
        this.obstacleTexture.update();
    }

    // Starts the tunnel with the free stream already blowing everywhere. The
    // pressure solve only carries information a few dozen cells per frame, so
    // without this the domain accelerates gradually from the inlet and the
    // smoke front rolls up on the shear against the still air ahead of it.
    prime () {
        if (!this.config.windTunnel) return;
        this.syncObstacles();   // a scene change must not prime through a stale mask
        const gl = this.gl;
        const P = this.programs;
        const c = this.config;
        gl.disable(gl.BLEND);
        P.fill.bind();
        gl.uniform2f(P.fill.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
        gl.uniform1i(P.fill.uniforms.uObstacles, this.obstacleTexture.attach(0));
        const u0 = c.windSpeed * c.windGain;
        gl.uniform2f(P.fill.uniforms.uValue, u0 * c.windDir[0], u0 * c.windDir[1]);
        this.blit(this.velocity.write);
        this.velocity.swap();
    }

    reset () {
        for (const target of [this.dye, this.velocity, this.pressure]) this.clearTarget(target);
        this.prime();
    }

    clearTarget (target) {
        const gl = this.gl;
        for (const fbo of [target.read, target.write]) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.fbo);
            gl.viewport(0, 0, fbo.width, fbo.height);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
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
        // (0,0) closes every wall; otherwise the flow axis opens up. Note this
        // follows windTunnel, not windGain: the ends of a tunnel stay open when
        // the fan is switched off. Sealing a box full of moving air makes it
        // slosh back and forth, which is correct for a sealed box and not at
        // all what "switch the wind off" should mean.
        const flowX = c.windTunnel ? c.windDir[0] : 0;
        const flowY = c.windTunnel ? c.windDir[1] : 0;

        gl.disable(gl.BLEND);

        // Uniform slow-down while the fan runs out. Scaling the whole field by
        // one number keeps it divergence free, so it launches no pressure wave -
        // the air just comes to rest. Braking it at a boundary instead sets the
        // whole box sloshing.
        if (c.windDecay > 0) {
            P.clear.bind();
            gl.uniform2f(P.clear.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
            gl.uniform1i(P.clear.uniforms.uTexture, velocity.read.attach(0));
            gl.uniform1f(P.clear.uniforms.value, Math.exp(-c.windDecay * dt));
            this.blit(velocity.write);
            velocity.swap();
        }

        // ---- wind tunnel forcing -------------------------------------------
        if (c.windTunnel && c.windGain > 0) {
            P.inflow.bind();
            gl.uniform2f(P.inflow.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
            gl.uniform1i(P.inflow.uniforms.uVelocity, velocity.read.attach(0));
            gl.uniform1i(P.inflow.uniforms.uObstacles, obst.attach(1));
            gl.uniform2f(P.inflow.uniforms.uDir, c.windDir[0], c.windDir[1]);
            gl.uniform1f(P.inflow.uniforms.uSpeed, c.windSpeed * c.windGain);
            gl.uniform1f(P.inflow.uniforms.uBand, c.inflowBand);
            // The strength fades with the fan, not just the target speed: at
            // gain 0 the band would otherwise still be forcing, only now
            // forcing the air to a standstill - a plug at the inlet while the
            // outlet keeps draining, which sucks the flow backwards.
            gl.uniform1f(P.inflow.uniforms.uInletStrength, Math.min(1.0, c.inletStrength) * c.windGain);
            gl.uniform1f(P.inflow.uniforms.uSpongeStrength, c.spongeStrength * c.windGain);
            gl.uniform1f(P.inflow.uniforms.uWobble, c.inflowWobble);
            gl.uniform1f(P.inflow.uniforms.uTime, this.time);
            this.blit(velocity.write);
            velocity.swap();
        }

        // ---- devices: fans, rotors, chimneys --------------------------------
        const devices = this.collectDevices();
        if (devices.count > 0) {
            P.drive.bind();
            gl.uniform2f(P.drive.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
            gl.uniform1i(P.drive.uniforms.uVelocity, velocity.read.attach(0));
            gl.uniform1i(P.drive.uniforms.uObstacles, obst.attach(1));
            this.setDeviceUniforms(P.drive, devices);
            gl.uniform1f(P.drive.uniforms.uCell, 1 / this.simHeight);
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
        // Suction only works while the tunnel is open: air cannot be drawn out
        // of a sealed box, and the pressure solve has no answer if asked to.
        const open = (flowX !== 0 || flowY !== 0);
        const sinks = open ? devices.sinks : [];
        gl.uniform4fv(P.divergence.uniforms['uSinks[0]'] || null, packSinks(sinks));
        gl.uniform1i(P.divergence.uniforms.uSinkCount, Math.min(MAX_SINKS, sinks.length / 4));
        gl.uniform1f(P.divergence.uniforms.uAspect, this.simWidth / this.simHeight);
        this.blit(this.divergence);

        P.clear.bind();
        gl.uniform2f(P.clear.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
        gl.uniform1i(P.clear.uniforms.uTexture, this.pressure.read.attach(0));
        // With the wind on, the outlet pins the pressure level and the field can
        // be carried over untouched. With it off every boundary is Neumann, the
        // level is free to drift, and a slow bleed keeps it bounded.
        gl.uniform1f(P.clear.uniforms.value, open ? c.PRESSURE_DECAY : Math.min(c.PRESSURE_DECAY, 0.99));
        this.blit(this.pressure.write);
        this.pressure.swap();

        const half = Math.max(1, Math.floor(c.PRESSURE_ITERATIONS / 2));
        this.smoothPressure(half, flowX, flowY);
        this.coarseCorrection(flowX, flowY);
        this.smoothPressure(c.PRESSURE_ITERATIONS - half, flowX, flowY);

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
        if (c.windTunnel && c.windGain > 0 && c.smokeRate > 0) {
            P.inject.bind();
            gl.uniform2f(P.inject.uniforms.texelSize, this.dye.texelSizeX, this.dye.texelSizeY);
            gl.uniform1i(P.inject.uniforms.uTarget, this.dye.read.attach(0));
            gl.uniform1i(P.inject.uniforms.uObstacles, obst.attach(1));
            gl.uniform2f(P.inject.uniforms.uDir, c.windDir[0], c.windDir[1]);
            gl.uniform1f(P.inject.uniforms.uBand, c.inflowBand * 0.6);
            gl.uniform1f(P.inject.uniforms.uStripes, c.smokeStripes);
            gl.uniform1f(P.inject.uniforms.uAmount, Math.min(1.0, c.smokeRate * dt * 8.0) * c.windGain);
            gl.uniform1f(P.inject.uniforms.uMode, c.smokeMode);
            gl.uniform3f(P.inject.uniforms.uColorA, c.smokeColorA[0], c.smokeColorA[1], c.smokeColorA[2]);
            gl.uniform3f(P.inject.uniforms.uColorB, c.smokeColorB[0], c.smokeColorB[1], c.smokeColorB[2]);
            this.blit(this.dye.write);
            this.dye.swap();
        }

        // ---- smoke of the devices -----------------------------------------------
        if (devices.count > 0) {
            P.deviceDye.bind();
            gl.uniform2f(P.deviceDye.uniforms.texelSize, this.dye.texelSizeX, this.dye.texelSizeY);
            gl.uniform1i(P.deviceDye.uniforms.uTarget, this.dye.read.attach(0));
            gl.uniform1i(P.deviceDye.uniforms.uObstacles, obst.attach(1));
            this.setDeviceUniforms(P.deviceDye, devices);
            gl.uniform1f(P.deviceDye.uniforms.uAmount, Math.min(1.0, c.smokeRate * dt * 8.0));
            const col = c.deviceSmokeColor;
            gl.uniform3f(P.deviceDye.uniforms.uColor, col[0], col[1], col[2]);
            this.blit(this.dye.write);
            this.dye.swap();
        }
    }

    // The devices among the obstacles, packed for the shaders: positions,
    // sizes and angles in uDev, type and speed in uDevP, suction vents once
    // more on their own for the divergence pass.
    collectDevices () {
        const c = this.config;
        const list = this.obstacles.drivers(this.canvas.width, this.canvas.height, MAX_DEVICES);
        const geo = new Float32Array(MAX_DEVICES * 4);
        const par = new Float32Array(MAX_DEVICES * 4);
        const sinks = [];
        const speeds = [c.fanSpeed, c.rotorSpeed, c.sinkSpeed, c.chimneySpeed];
        list.forEach((d, i) => {
            geo.set([d.x, d.y, d.r, d.angle], i * 4);
            let speed = speeds[d.type] * c.windSpeed;
            if (d.type === 1) speed *= d.spin;
            par.set([d.type, speed, 0, 0], i * 4);
            if (d.type === 2 && sinks.length < 16) {
                // strength per cell, so that the air arrives at the rim of
                // the vent at the set speed: q * area = speed * circumference
                const rCells = Math.max(1, d.r * this.simHeight);
                sinks.push(d.x, d.y, d.r, 2.8 * speed / rCells);
            }
        });
        return { count: list.length, geo, par, sinks };
    }

    setDeviceUniforms (program, devices) {
        const gl = this.gl;
        const u = program.uniforms;
        gl.uniform4fv(u['uDev[0]'] || null, devices.geo);
        gl.uniform4fv(u['uDevP[0]'] || null, devices.par);
        gl.uniform1i(u.uDevCount, devices.count);
        gl.uniform1f(u.uAspect, this.simWidth / this.simHeight);
    }

    // Jacobi sweeps on the fine grid.
    smoothPressure (iterations, flowX, flowY) {
        const gl = this.gl;
        const P = this.programs;
        P.pressure.bind();
        gl.uniform2f(P.pressure.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
        gl.uniform1i(P.pressure.uniforms.uDivergence, this.divergence.attach(0));
        gl.uniform1i(P.pressure.uniforms.uObstacles, this.obstacleTexture.attach(1));
        gl.uniform2f(P.pressure.uniforms.uFlow, flowX, flowY);
        for (let i = 0; i < iterations; i++) {
            gl.uniform1i(P.pressure.uniforms.uPressure, this.pressure.read.attach(2));
            this.blit(this.pressure.write);
            this.pressure.swap();
        }
    }

    // Solve the residual equation on a coarse grid and add the correction back.
    // This is what carries the long wavelength part of the pressure - the part
    // that decides whether a room with one opening fills up or keeps flowing.
    coarseCorrection (flowX, flowY) {
        const c = this.config;
        if (c.COARSE_ITERATIONS <= 0) return;
        const gl = this.gl;
        const P = this.programs;
        const obst = this.obstacleTexture;

        P.residual.bind();
        gl.uniform2f(P.residual.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
        gl.uniform1i(P.residual.uniforms.uPressure, this.pressure.read.attach(0));
        gl.uniform1i(P.residual.uniforms.uDivergence, this.divergence.attach(1));
        gl.uniform1i(P.residual.uniforms.uObstacles, obst.attach(2));
        gl.uniform2f(P.residual.uniforms.uFlow, flowX, flowY);
        this.blit(this.residual);

        const scaleX = this.velocity.width / this.coarseResidual.width;
        const scaleY = this.velocity.height / this.coarseResidual.height;
        P.restrict.bind();
        gl.uniform2f(P.restrict.uniforms.texelSize, this.coarseResidual.texelSizeX, this.coarseResidual.texelSizeY);
        gl.uniform1i(P.restrict.uniforms.uResidual, this.residual.attach(0));
        gl.uniform2f(P.restrict.uniforms.uFineTexel, this.velocity.texelSizeX, this.velocity.texelSizeY);
        gl.uniform1f(P.restrict.uniforms.uScale, scaleX * scaleY);
        this.blit(this.coarseResidual);

        // the correction starts from zero every frame
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.coarsePressure.read.fbo);
        gl.viewport(0, 0, this.coarsePressure.read.width, this.coarsePressure.read.height);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);

        P.pressure.bind();
        gl.uniform2f(P.pressure.uniforms.texelSize, this.coarsePressure.texelSizeX, this.coarsePressure.texelSizeY);
        gl.uniform1i(P.pressure.uniforms.uDivergence, this.coarseResidual.attach(0));
        gl.uniform1i(P.pressure.uniforms.uObstacles, obst.attach(1));
        gl.uniform2f(P.pressure.uniforms.uFlow, flowX, flowY);
        for (let i = 0; i < c.COARSE_ITERATIONS; i++) {
            gl.uniform1i(P.pressure.uniforms.uPressure, this.coarsePressure.read.attach(2));
            this.blit(this.coarsePressure.write);
            this.coarsePressure.swap();
        }

        P.prolong.bind();
        gl.uniform2f(P.prolong.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
        gl.uniform1i(P.prolong.uniforms.uPressure, this.pressure.read.attach(0));
        gl.uniform1i(P.prolong.uniforms.uCoarse, this.coarsePressure.read.attach(1));
        gl.uniform1i(P.prolong.uniforms.uObstacles, obst.attach(2));
        this.blit(this.pressure.write);
        this.pressure.swap();
    }

    // x, y in [0,1] with y pointing up; dx, dy are velocity impulses; color is
    // premultiplied dye [r, g, b, coverage].
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
        gl.uniform4f(P.splat.uniforms.color, dx, dy, 0.0, 0.0);
        gl.uniform1f(P.splat.uniforms.radius, this.correctRadius(this.config.SPLAT_RADIUS / 100.0));
        this.blit(this.velocity.write);
        this.velocity.swap();

        if (color) {
            gl.uniform2f(P.splat.uniforms.texelSize, this.dye.texelSizeX, this.dye.texelSizeY);
            gl.uniform1i(P.splat.uniforms.uTarget, this.dye.read.attach(0));
            gl.uniform4f(P.splat.uniforms.color, color[0], color[1], color[2], color[3]);
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
        const u = P.display.uniforms;
        const rgb = (loc, v) => gl.uniform3f(loc, v[0], v[1], v[2]);
        rgb(u.uBackground, c.backgroundColor);
        rgb(u.uSolid, c.solidColor);
        [u.uSpeed0, u.uSpeed1, u.uSpeed2, u.uSpeed3, u.uSpeed4].forEach((loc, i) => rgb(loc, c.speedColormap[i]));
        rgb(u.uDivLo, c.divergingColormap[0]);
        rgb(u.uDivMid, c.divergingColormap[1]);
        rgb(u.uDivHi, c.divergingColormap[2]);
        this.blit(null);
    }
}
