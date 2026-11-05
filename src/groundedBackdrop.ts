import * as THREE from 'three';
import {INITIAL_VIEW,applyCameraView} from './cameraView';
import {PORTRAIT_ASPECT} from './presentation';

/** Depth of the photo wall; the floor runs from it toward the camera. */
export const BACKDROP_WALL_Z = -12;
export interface GroundShadowOptions {
  enabled: boolean;
  opacity: number;
  width: number;
  depth: number;
  softness: number;
  contact: number;
}

/** Photograph projected onto a backdrop and floor, sharing the character's camera. */
export class GroundedBackdrop {
  readonly root = new THREE.Group();
  private material: THREE.ShaderMaterial;
  private shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  constructor(scale: number, focusYcm: number) {
    const floorY=-focusYcm*scale;
    const ref=new THREE.PerspectiveCamera(18,PORTRAIT_ASPECT,.5,200);
    applyCameraView(ref,INITIAL_VIEW,scale,focusYcm);
    const projection=new THREE.Matrix4().multiplyMatrices(ref.projectionMatrix,ref.matrixWorldInverse);
    this.material=new THREE.ShaderMaterial({
      uniforms:{photo:{value:null},projection:{value:projection},photoAspect:{value:16/9}},
      vertexShader:`uniform mat4 projection; varying vec4 photoPosition;
        void main(){vec4 world=modelMatrix*vec4(position,1.);photoPosition=projection*world;gl_Position=projectionMatrix*viewMatrix*world;}`,
      fragmentShader:`uniform sampler2D photo; uniform float photoAspect; varying vec4 photoPosition;
        void main(){vec2 p=photoPosition.xy/photoPosition.w;vec2 uv=vec2(p.x*(.5625/photoAspect),p.y)*.5+.5;
          gl_FragColor=texture2D(photo,clamp(vec2(1.-abs(mod(uv.x,2.)-1.),uv.y),vec2(.001),vec2(.999)));
          #include <colorspace_fragment>
        }`,
      side:THREE.DoubleSide, toneMapped:false,
    });
    const wall=new THREE.Mesh(new THREE.PlaneGeometry(240,240),this.material);
    wall.position.set(0,floorY+120,BACKDROP_WALL_Z);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(240,112),this.material);
    floor.rotation.x=-Math.PI/2;floor.position.set(0,floorY,44);
    this.root.add(wall,floor);
    const shadow=this.shadow=new THREE.Mesh(new THREE.PlaneGeometry(5,3),new THREE.ShaderMaterial({
      uniforms:{opacity:{value:.65},softness:{value:1.4},contact:{value:.85},spread:{value:new THREE.Vector2(1.2,1.6)},extent:{value:new THREE.Vector2(5,3)}},
      vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`varying vec2 vUv; uniform float opacity; uniform float softness;
        uniform float contact; uniform vec2 spread; uniform vec2 extent;
        void main(){vec2 p=(vUv-.5)*extent;
          vec2 q=p/(vec2(1.45,.8)*spread);
          float broad=exp(-dot(q,q)*2./softness);
          // Foot contacts stay under the feet when the broad shadow is resized or softened.
          vec2 a=(p-vec2(-.56,0.))/vec2(.42,.52), b=(p-vec2(.56,0.))/vec2(.42,.52);
          float feet=max(exp(-dot(a,a)*2.),exp(-dot(b,b)*2.));
          vec2 edge=smoothstep(vec2(0.),vec2(.15),vUv)*(1.-smoothstep(vec2(.85),vec2(1.),vUv));
          float alpha=opacity*(1.-(1.-broad*.4)*(1.-feet*contact))*edge.x*edge.y;
          gl_FragColor=vec4(.045,.05,.09,alpha);
          #include <colorspace_fragment>
        }`,
      transparent:true,depthWrite:false,toneMapped:false,
    }));
    shadow.rotation.x=-Math.PI/2;shadow.position.set(0,floorY+.012,.18);shadow.renderOrder=1;
    this.root.add(shadow);this.root.visible=false;
  }
  applyShadow(options: GroundShadowOptions): void {
    this.shadow.visible=options.enabled;
    // Keep enough geometry for both fixed foot contacts even at the smallest spread.
    const width=Math.max(1,options.width),depth=Math.max(1,options.depth);
    this.shadow.scale.set(width,depth,1);
    this.shadow.material.uniforms.extent.value.set(5*width,3*depth);
    this.shadow.material.uniforms.spread.value.set(Math.max(.1,options.width),Math.max(.1,options.depth));
    this.shadow.material.uniforms.opacity.value=options.opacity;
    this.shadow.material.uniforms.softness.value=Math.max(.1,options.softness);
    this.shadow.material.uniforms.contact.value=options.contact;
  }
  setTexture(texture:THREE.Texture|null,aspect:number):void{
    this.material.uniforms.photo.value=texture;
    this.material.uniforms.photoAspect.value=aspect;
    this.root.visible=!!texture;
  }
}
