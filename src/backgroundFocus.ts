import * as THREE from 'three';

export interface BackgroundFocusOptions { enabled: boolean; strength: number }

/** Cached, linear-light blur of the photograph only. No character/depth render pass. */
export class BackgroundFocus {
  private source: THREE.Texture | null = null;
  private strength = -1;
  private horizontal = new THREE.WebGLRenderTarget(1, 1, {type: THREE.HalfFloatType, depthBuffer: false});
  private blurred = new THREE.WebGLRenderTarget(1, 1, {type: THREE.HalfFloatType, depthBuffer: false});
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private viewport = new THREE.Vector4();
  private scissor = new THREE.Vector4();
  private material = new THREE.ShaderMaterial({
    uniforms: {photo: {value: null}, stepUv: {value: new THREE.Vector2()}},
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader: `uniform sampler2D photo; uniform vec2 stepUv; varying vec2 vUv;
      void main(){vec4 sum=vec4(0.);float total=0.;
        for(int i=-6;i<=6;i++){
          float x=float(i),w=exp(-.5*x*x/9.);
          sum+=texture2D(photo,clamp(vUv+stepUv*x,vec2(0.),vec2(1.)))*w;total+=w;
        }
        gl_FragColor=sum/total;
      }`,
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  constructor(){
    this.horizontal.texture.colorSpace=THREE.LinearSRGBColorSpace;
    this.blurred.texture.colorSpace=THREE.LinearSRGBColorSpace;
    const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material);
    quad.frustumCulled=false;this.scene.add(quad);
  }
  invalidate():void { this.source=null; }
  prepare(renderer:THREE.WebGLRenderer,photo:THREE.Texture,aspect:number,strength:number):THREE.Texture {
    const radius=Number.isFinite(strength)?THREE.MathUtils.clamp(strength,0,40):24;
    if(this.source===photo && this.strength===radius)return this.blurred.texture;
    const width=540,height=Math.max(1,Math.round(width/aspect));
    this.horizontal.setSize(width,height);this.blurred.setSize(width,height);
    const target=renderer.getRenderTarget(),autoClear=renderer.autoClear,scissorTest=renderer.getScissorTest();
    renderer.getViewport(this.viewport);renderer.getScissor(this.scissor);
    try {
      renderer.autoClear=true;renderer.setScissorTest(false);
      // Strength is the kernel radius at 1080px image width; UVs keep it resolution independent.
      this.material.uniforms.photo.value=photo;
      this.material.uniforms.stepUv.value.set(radius/(6*1080),0);
      renderer.setRenderTarget(this.horizontal);renderer.render(this.scene,this.camera);
      this.material.uniforms.photo.value=this.horizontal.texture;
      this.material.uniforms.stepUv.value.set(0,radius*aspect/(6*1080));
      renderer.setRenderTarget(this.blurred);renderer.render(this.scene,this.camera);
      this.source=photo;this.strength=radius;
    } finally {
      renderer.setRenderTarget(target);renderer.setViewport(this.viewport);renderer.setScissor(this.scissor);
      renderer.setScissorTest(scissorTest);renderer.autoClear=autoClear;
    }
    return this.blurred.texture;
  }
}
