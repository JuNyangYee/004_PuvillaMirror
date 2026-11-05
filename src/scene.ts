import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Config } from "./config";
import { log } from "./logger";
import { lightMobile } from "./mobile";
import { PaintFilter } from "./paintFilter";
import { OilStrokeFilter } from "./oilFilter";
import {portraitViewport, PORTRAIT_ASPECT} from "./presentation";
import {GroundedBackdrop} from "./groundedBackdrop";
import {applyCameraView, centerFeetInView, CAMERA_FOV} from "./cameraView";
import type {Backdrop} from "./backdrop";
import {lightPosition} from "./lighting";
import {Snowfall} from "./snowfall";

/** 시야각 18° (망원 — 원근 왜곡 적게, 가이드 3D 렌더 느낌) */
const CAM_FOV = CAMERA_FOV;

/** 렌더러·카메라·조명. 세로 디스플레이(거울 프레임) 기준 레이아웃. */
export class Scene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  /** Output reflection is outside the rig, so it never changes tracked input or joint state. */
  readonly characterOutput = new THREE.Group();
  readonly camera: THREE.PerspectiveCamera;
  private onLost: (() => void) | null = null;
  private lights!: { key: THREE.DirectionalLight; fill: THREE.DirectionalLight; rim: THREE.DirectionalLight; bounce: THREE.DirectionalLight; hemi: THREE.HemisphereLight };

  private grounded:GroundedBackdrop;
  private snow:Snowfall;
  private winterLighting = true;
  syncBackdrop(backdrop:Backdrop):void{
    backdrop.setWorldRendered(true);
    this.grounded.setTexture(backdrop.worldTexture,backdrop.imageAspect);
    this.setWinterLighting(backdrop.usesImage);
  }
  setWinterLighting(on:boolean):void{
    this.winterLighting=on;this.applyLighting();
  }

  /** 오버레이에서 조명 값을 바꿨을 때 */
  applyLighting(): void {
    this.grounded.applyShadow(this.cfg.groundShadow);
    const winter=this.winterLighting;
    for(const role of ["key","fill","rim","bounce"] as const){
      this.lights[role].position.set(...lightPosition(this.cfg.lightDirections[role]));
    }
    const colors=this.cfg.winterLightColors;
    this.lights.key.color.set(winter ? colors.key : '#ffffff');
    this.lights.fill.color.set(winter ? colors.fill : '#ffffff');
    this.lights.rim.color.set(winter ? colors.rim : '#ffffff');
    this.lights.bounce.color.set(winter ? colors.bounce : '#ffffff');
    this.lights.hemi.color.set(winter ? colors.sky : '#ffffff');
    this.lights.hemi.groundColor.set(winter ? colors.ground : '#d8d8d8');
    this.lights.key.intensity = this.cfg.keyLight;
    this.lights.fill.intensity = this.cfg.fillLight;
    this.lights.rim.intensity = this.cfg.rimLight;
    this.lights.bounce.intensity = winter ? this.cfg.bounceLight : 0;
    this.lights.hemi.intensity = this.cfg.hemiLight;
    this.scene.environmentIntensity = this.cfg.envLight;
    this.renderer.toneMappingExposure = this.cfg.exposure;
    this.resize();
  }

  /** Called only when the source scene is actually rendered. */
  beforeRender: (() => void) | null = null;

  private paint: PaintFilter | null = null;
  private oil: OilStrokeFilter | null = null;
  /** 그림 배경 (겨울 마을) — 그림 필터가 그 위에 캐릭터를 합성 */
  backdrop: { texture: THREE.Texture | null; frontTexture(): THREE.Texture | null; setFrontBaked(on: boolean): void } | null = null;

  constructor(container: HTMLElement, private cfg: Config["scene"], private ch: Config["character"], private filterCfg?: Config["filter"]) {
    this.scene.add(this.characterOutput);
    this.grounded=new GroundedBackdrop(ch.modelScale,ch.focusYcm);
    this.scene.add(this.grounded.root);
    this.snow=new Snowfall(ch.modelScale,ch.focusYcm,cfg.snow);
    this.scene.add(this.snow.points);
    // 폰·태블릿은 MSAA 끔 (픽셀 밀도가 높아 계단이 덜 보이고 부하는 큼)
    this.renderer = new THREE.WebGLRenderer({ antialias: !lightMobile(), alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // 흰 털이 회색으로 죽지 않도록 Neutral 톤매핑 (가이드 BODY COLOR #FFFFFF / 털 #F2F2F2)
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = cfg.exposure;
    container.appendChild(this.renderer.domElement);

    // 가이드북 3D 렌더처럼 망원 느낌(원근 왜곡 적게) — 광각이면 앞으로 튀어나온 코가 커 보이고 눈이 옆으로 밀려 보인다
    this.camera = new THREE.PerspectiveCamera(CAM_FOV, 1, 0.5, 200);

    // 배경: 가이드 KEY COLOR(#F55433) 계열 세로 그라디언트 — 그래픽 팀 프레임 이미지로 교체 대상
    // 배경은 페이지 전체 그라디언트 하나로 (캔버스는 투명) — 세로 화면에서 위아래 여백과 캔버스 경계가 끊겨 보이지 않게
    this.renderer.setClearColor(0x000000, 0);
    (document.getElementById("stage") ?? container).style.background = `linear-gradient(${cfg.bgTop}, ${cfg.bgBottom})`;

    // 부드러운 스튜디오 반사 + 키/필/림
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = cfg.envLight;
    const key = new THREE.DirectionalLight(0xffffff, cfg.keyLight);
    const fill = new THREE.DirectionalLight(0xffffff, cfg.fillLight);
    const rim = new THREE.DirectionalLight(0xffffff, cfg.rimLight);
    const bounce = new THREE.DirectionalLight(0xffffff, cfg.bounceLight);
    // 가이드 2.4 그림자는 중립 회색 (살구빛 바닥 반사를 넣으면 털이 분홍빛으로 물듦)
    const hemi = new THREE.HemisphereLight(0xffffff, 0xd8d8d8, cfg.hemiLight);
    this.scene.add(key, fill, rim, bounce, hemi);
    this.lights = { key, fill, rim, bounce, hemi };
    this.applyLighting();

    this.resize();
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("orientationchange", () => setTimeout(() => this.resize(), 200));

    const el = this.renderer.domElement;
    el.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      log.error("scene", "WebGL context lost");
      this.onLost?.();
    });
    el.addEventListener("webglcontextrestored", () => log.warn("scene", "WebGL context restored"));
  }

  /** 성능 단계에서 렌더 해상도 변경 */
  setPixelRatio(r: number): void {
    if (this.renderer.getPixelRatio() === r) return;
    // three 의 setPixelRatio 는 내부에서 setSize 를 불러 캔버스를 비움 → 바로 다시 그림
    this.renderer.setPixelRatio(r);
    this.resize();
    if (this.ready) this.render();
  }

  onContextLost(fn: () => void): void {
    this.onLost = fn;
  }

  /** 지금 화면 방향의 시점 값 (터치 확대·이동이 이 값을 바꿈) */
  /** 운영 화면은 항상 세로 9:16. */
  get portrait(): boolean { return true; }

  view(): { center: number; height: number; offsetX: number } {
    const c = this.cfg;
    return this.portrait
      ? { center: c.pViewCenterCm, height: c.pViewHeightCm, offsetX: c.pViewOffsetXcm }
      : { center: c.viewCenterCm, height: c.viewHeightCm, offsetX: c.viewOffsetXcm };
  }

  centerFeetInView(): void {
    centerFeetInView(this.camera,this.cfg,this.ch.modelScale,this.ch.focusYcm);
  }

  setView(v: { center: number; height: number; offsetX: number }): void {
    const c = this.cfg;
    const height = Math.min(260, Math.max(25, v.height));
    const center = Math.min(220, Math.max(-100, v.center));
    const offsetX = Math.min(80, Math.max(-80, v.offsetX));
    if (this.portrait) Object.assign(c, { pViewCenterCm: center, pViewHeightCm: height, pViewOffsetXcm: offsetX });
    else Object.assign(c, { viewCenterCm: center, viewHeightCm: height, viewOffsetXcm: offsetX });
    this.resize();
  }

  /** 화면 1px 이 캐릭터 몇 cm 인지 — 터치·드래그 이동량 변환용 */
  get cmPerPx(): number {
    return this.view().height / Math.max(1,portraitViewport(innerWidth,innerHeight).height);
  }

  resize(): void {
    const {width:W,height:H} = portraitViewport(innerWidth,innerHeight);
    if (!W || !H) return; // 탭이 숨겨진 순간 등 크기 0 → 계산하면 카메라가 NaN 이 됨
    const el = this.renderer.domElement;
    el.style.width = "100%";
    el.style.height = "100%";
    el.style.margin = "0";
    // 캔버스 크기는 '실제로 바뀔 때만' 설정 — 같은 값이라도 다시 넣으면 브라우저가 캔버스를 비워서,
    // 다음 프레임 전까지 캐릭터가 사라지고 배경만 깜빡 보임 (폰 주소창 숨김·터치 확대·품질 단계 변경 때마다)
    const pr = this.renderer.getPixelRatio();
    const bw = Math.floor(W * pr), bh = Math.floor(H * pr);
    const resized = el.width !== bw || el.height !== bh;
    if (resized) this.renderer.setSize(W, H, false);
    this.camera.aspect = PORTRAIT_ASPECT;
    this.camera.fov = CAM_FOV;
    applyCameraView(this.camera,this.cfg,this.ch.modelScale,this.ch.focusYcm);
    // 크기가 바뀌어 캔버스가 비었으면 다음 프레임을 기다리지 않고 바로 다시 그림
    if (resized && this.ready) this.render();
  }

  /** 첫 프레임 전엔 resize 에서 바로 그리지 않음 (캐릭터 로드 전) */
  ready = false;

  render(): void {
    this.characterOutput.scale.x = this.cfg.outputMirror ? -1 : 1;
    // 눈은 겨울 사진 배경과 같이 장면에 그려져 유화 켜짐/꺼짐 모두 같은 원본 렌더를 탄다
    this.snow.show(this.grounded.root.visible, !!this.filterCfg?.oil?.enabled);
    if (this.filterCfg?.oil?.enabled) {
      this.oil ??= new OilStrokeFilter(
        this.renderer, this.scene, this.camera, this.filterCfg.oil, { top: this.cfg.bgTop, bottom: this.cfg.bgBottom },
        () => this.backdrop?.texture ?? null,
        { lo: this.filterCfg.edgeLo, hi: this.filterCfg.edgeHi },
        () => this.backdrop?.frontTexture() ?? null,
        () => this.beforeRender?.(),
      );
      this.oil.render();
      return;
    }
    this.oil?.hide();
    this.beforeRender?.();
    this.backdrop?.setFrontBaked(false);
    if (this.filterCfg?.enabled) {
      this.paint ??= new PaintFilter(this.renderer, this.scene, this.camera, this.filterCfg, { top: this.cfg.bgTop, bottom: this.cfg.bgBottom }, () =>
        this.backdrop?.texture ?? null,
      );
      this.paint.render();
      return;
    }
    this.renderer.render(this.scene, this.camera);
  }
}
