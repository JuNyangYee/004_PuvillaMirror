import * as THREE from 'three';
import {INITIAL_VIEW,applyCameraView} from './cameraView';
import {PORTRAIT_ASPECT} from './presentation';

/** Photograph projected onto a backdrop and floor, sharing the character's camera. */
export class GroundedBackdrop {
  readonly root = new THREE.Group();
  private material: THREE.ShaderMaterial;
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
    wall.position.set(0,floorY+120,-12);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(240,112),this.material);
    floor.rotation.x=-Math.PI/2;floor.position.set(0,floorY,44);
    this.root.add(wall,floor);
    const shadow=new THREE.Mesh(new THREE.PlaneGeometry(5,3),new THREE.ShaderMaterial({
      vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`varying vec2 vUv;
        void main(){vec2 p=(vUv-.5)*vec2(5.,3.);
          float broad=exp(-dot(p/vec2(1.45,.8),p/vec2(1.45,.8))*2.);
          vec2 a=(p-vec2(-.56,0.))/vec2(.48,.5), b=(p-vec2(.56,0.))/vec2(.48,.5);
          float feet=max(exp(-dot(a,a)*2.),exp(-dot(b,b)*2.));
          gl_FragColor=vec4(.025,.04,.075,broad*.24+feet*.36);
          #include <colorspace_fragment>
        }`,
      transparent:true,depthWrite:false,toneMapped:false,
    }));
    shadow.rotation.x=-Math.PI/2;shadow.position.set(0,floorY+.012,.18);shadow.renderOrder=1;
    this.root.add(shadow);this.root.visible=false;
  }
  setTexture(texture:THREE.Texture|null,aspect:number):void{
    this.material.uniforms.photo.value=texture;
    this.material.uniforms.photoAspect.value=aspect;
    this.root.visible=!!texture;
  }
}
