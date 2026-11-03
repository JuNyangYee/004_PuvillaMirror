import * as THREE from 'three';
import type {Config} from './config';
import {BACKDROP_WALL_Z} from './groundedBackdrop';

/** Every flake completes whole fall and sway cycles per loop, so wrapping the phase is seamless. */
export const SNOW_LOOP_SECONDS = 1200;
/** Flakes drawn at amount 1; the buffer holds enough for amount 2. */
export const SNOW_BASE_FLAKES = 900;
/** Fall volume in world units: behind the character's back, in front of the photo wall. */
export const SNOW_VOLUME = Object.freeze({halfWidth: 10, height: 16, nearZ: -2, farZ: BACKDROP_WALL_Z + .6, swayZ: .1});

/** Seeded so every load (and every screenshot) gets the same sky. */
function mulberry32(seed: number): () => number {
  return () => {
    seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Sparse, slow snow between the character and the winter backdrop, in scene space so orbit, pan and zoom move it
 * like the photo. Positions are evaluated on the GPU; the phase advances only when the source scene is drawn,
 * so it follows the oil filter's cadence without its own loop.
 */
export class Snowfall {
  readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private phase = 0;
  private painted = false;
  private lastSeconds = -1;
  private readonly viewport = new THREE.Vector4();

  constructor(scale: number, focusYcm: number, private cfg: Config['scene']['snow']) {
    const v = SNOW_VOLUME, random = mulberry32(0x5eed), count = SNOW_BASE_FLAKES * 2;
    const position = new Float32Array(count * 3), motion = new Float32Array(count * 4), look = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const depth = random(), sway = .1 + .25 * random();
      // x, start height (fraction of the fall), z; the sway never brings a flake nearer than nearZ
      position.set([(random() * 2 - 1) * v.halfWidth, random(), THREE.MathUtils.lerp(v.farZ, v.nearZ - v.swayZ, depth)], i * 3);
      // cycles per loop: fall .55-1 units/s, sway period 4-9 s, sway phase, sway width
      motion.set([Math.max(1, Math.round((.55 + .45 * random()) * SNOW_LOOP_SECONDS / v.height)), Math.round(SNOW_LOOP_SECONDS / (4 + 5 * random())), random(), sway], i * 4);
      // world diameter, opacity (farther flakes fainter)
      look.set([.025 + .035 * random(), (.35 + .4 * random()) * (.65 + .35 * depth)], i * 2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('motion', new THREE.BufferAttribute(motion, 4));
    geometry.setAttribute('look', new THREE.BufferAttribute(look, 2));
    const material = new THREE.ShaderMaterial({
      uniforms: {
        phase: {value: 0}, pixelScale: {value: 1}, maxPixels: {value: 12}, painted: {value: 0},
        floorY: {value: -focusYcm * scale}, fallHeight: {value: v.height}, swayZ: {value: v.swayZ},
        flakeColor: {value: new THREE.Color('#f4f8ff')},
      },
      vertexShader: `uniform float phase, pixelScale, maxPixels, painted, floorY, fallHeight, swayZ;
        attribute vec4 motion; attribute vec2 look; varying float flakeAlpha;
        void main(){
          vec3 p = position;
          float rise = fallHeight * (1. - fract(position.y + motion.x * phase));
          float sway = 6.2831853 * (motion.y * phase + motion.z);
          p.x += motion.w * (sin(sway) + .35 * sin(2. * sway + 1.7));
          p.y = floorY + rise;
          p.z += swayZ * cos(sway);
          vec4 view = modelViewMatrix * vec4(p, 1.);
          gl_Position = projectionMatrix * view;
          // the oil filter repaints at brush scale: a larger dot comes out as a hollow ring, a small crisp one as a dab
          float paintScale = mix(1., .6, painted);
          float size = paintScale * look.x * projectionMatrix[1][1] * pixelScale / -view.z;
          gl_PointSize = clamp(size, 1.5, maxPixels * paintScale);
          // sub-pixel flakes fade instead of flickering; land softly, never pop in at the top
          flakeAlpha = look.y * min(1., size * size / 2.25) * smoothstep(0., .6, rise) * (1. - smoothstep(fallHeight - 1., fallHeight, rise));
        }`,
      fragmentShader: `uniform vec3 flakeColor; uniform float painted; varying float flakeAlpha;
        void main(){
          vec2 c = gl_PointCoord * 2. - 1.;
          float soft = max(0., 1. - dot(c, c));
          float d = mix(soft * soft, 1. - smoothstep(.45, 1., length(c)), painted);
          gl_FragColor = vec4(flakeColor, flakeAlpha * d);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, toneMapped: false,
    });
    this.points = new THREE.Points(geometry, material);
    // Positions come from the shader; drawn first among transparent layers, so fur and the contact shadow cover it.
    this.points.frustumCulled = false;
    this.points.renderOrder = -1;
    this.points.onBeforeRender = (renderer) => {
      const seconds = performance.now() / 1000;
      if (this.lastSeconds >= 0) this.phase = (this.phase + Math.min(1, seconds - this.lastSeconds) * Math.max(0, this.cfg.speed) / SNOW_LOOP_SECONDS) % 1;
      this.lastSeconds = seconds;
      // Current target: the canvas, or the oil filter's source buffer; same pixel size either way.
      renderer.getCurrentViewport(this.viewport);
      const u = material.uniforms;
      u.phase.value = this.phase;
      u.painted.value = this.painted ? 1 : 0;
      u.pixelScale.value = this.viewport.w / 2;
      u.maxPixels.value = Math.max(2, this.viewport.w * .007);
      geometry.setDrawRange(0, Math.round(SNOW_BASE_FLAKES * Math.min(2, Math.max(0, this.cfg.amount))));
    };
  }

  /** Shown only over the winter photograph; `painted` = the oil filter repaints this render. */
  show(winter: boolean, painted: boolean): void {
    this.points.visible = winter && this.cfg.enabled;
    this.painted = painted;
  }
}
