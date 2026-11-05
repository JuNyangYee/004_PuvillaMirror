import {galleryUpdateControls} from './galleryControls';
import GUI from "lil-gui";
import {resetLightDirections, type LightRole} from "./lighting";
import {resetCameraView, ORBIT_LIMITS} from "./cameraView";
import { downloadConfig, saveConfig, type Config } from "./config";
import type { FaceSignal } from "./signals";
import type { StateSnapshot } from "./state";
import type { BodyPose } from "./body";

export interface OverlayStats {
  renderFps: number;
  inferFps: number;
  inferenceMs: number;
  poseMs: number;
  body: BodyPose | null;
  modelSource: string;
  sig: FaceSignal;
  snap: StateSnapshot;
  /** 'o' 전환 기준 (입술 간격, 입 폭 대비) */
  mouthOpenFrom: number;
}

const STATE_KO: Record<string, string> = {
  IDLE: "대기(아무도 없음)",
  ATTRACT: "유도(빼꼼·손짓)",
  PREPARE: "1 · 인식 준비(두리번거리기)",
  ENTER: "등장",
  MIMIC: "따라하기",
  EXIT: "퇴장",
};

/**
 * 개발용 튜닝 오버레이. `d` 키로 토글. 값은 config 객체를 직접 바꾸므로 즉시 반영된다.
 * '저장' 은 config.json 을 다운로드 → public/config.json 에 덮어쓰면 다음 실행부터 적용.
 * 라벨 = "설명 (단위)", 괄호 안 영문은 config.json 키 이름.
 */
export class Overlay {
  private gui: GUI;
  private statsEl: HTMLElement;
  private visible = true;

  constructor(private cfg: Config, hooks: { onSmoothingChange: () => void; onCharacterChange: () => void; onSceneChange: () => void; onFaceNeutral?: () => void; onCenterFeet?:()=>void; onRecognitionRestart?:()=>void }) {
    this.statsEl = document.getElementById("stats")!;
    this.gui = new GUI({ title: "푸빌라 설정 · D로 닫기", width: 360 });
    const onC = hooks.onCharacterChange;
    galleryUpdateControls(this.gui);

    const vision=this.gui.addFolder('인식 설정 — YOLO · MediaPipe');
    vision.add(cfg.person,'enabled').name('YOLO로 대상 1명 선택');
    vision.add(cfg.person,'confidence',.15,.9,.05).name('사람 검출 신뢰도');
    vision.add(cfg.person,'intervalMs',50,500,10).name('YOLO 검출 간격 (ms)');
    vision.add(cfg.person,'padding',.05,.5,.05).name('입력 박스 여백 (비율)');
    vision.add(cfg.person,'switchRatio',1,2,.05).name('전환할 사람의 최소 크기 배율');
    vision.add(cfg.person,'switchHoldMs',0,5000,50).name('더 큰 사람으로 전환 대기 (ms)');
    vision.add(cfg.person,'lostHoldMs',200,1000,50).name('사람 박스 소실 유예 (ms)');
    vision.add(cfg.recognition,'confirmMs',150,1500,50).name('얼굴 연속 확인 후 시작 (ms)');
    const range=vision.addFolder('참여 범위 · 단계');
    for(const [key,label] of [['left','왼쪽'],['right','오른쪽'],['top','위'],['bottom','아래']] as const)
      range.add(cfg.recognition.margins,key,0,.45,.01).name(label+' 제외 마진 (비율)').listen();
    range.add(cfg.recognition,'prepareArea',.005,.5,.005).name('1 준비: 사람 면적 ≥');
    range.add(cfg.recognition,'activeArea',.01,.8,.005).name('2 인식: 사람 면적 ≥');
    range.add(cfg.recognition,'faceHeight',.02,.5,.005).name('2 인식: 얼굴 높이 ≥');
    range.add(cfg.recognition,'prepareLookDeg',0,35,1).name('준비 고개 회전 (°)');
    const rangeHint=document.createElement('div');rangeHint.style.cssText='padding:6px 8px;font-size:11px;line-height:1.5;opacity:.75';
    rangeHint.textContent='0: 범위 밖·작은 사람 / 1: 준비·두리번거리기 / 2: 크기·얼굴 연속 확인 후 따라하기. 사람 면적은 영상 대비 비율(0.08=8%), 얼굴 높이는 영상의 짧은 변 대비 비율입니다. 사람 박스 중심으로 마진을 확인하며 팔은 범위 밖으로 뻗어도 됩니다.';
    range.$children.appendChild(rangeHint);range.close();
    vision.add({retry:()=>hooks.onRecognitionRestart?.()},'retry').name('YOLO 다시 초기화');
    const note=document.createElement('div');note.style.cssText='padding:6px 8px;font-size:11px;color:#abb8c8;line-height:1.5';
    note.textContent='허용 마진 안의 사람 중 가장 크게 보이는 사람을 선택합니다. 다른 사람이 설정 배율보다 크게 보이는 상태가 전환 대기 시간 동안 이어지면 교체합니다. 새 대상은 얼굴 확인을 거친 뒤 반영합니다. 실제 거리 측정이나 신원 식별은 아니므로 겹친 사람은 혼동할 수 있습니다. YOLO를 끄면 전체 영상에서 MediaPipe 1명 추적만 사용합니다.';
    vision.$children.appendChild(note);vision.close();
    const debug=this.gui.addFolder('카메라 인식 디버그');
    debug.add(cfg.debugVision,'recognitionRange').name('참여 허용 범위 · 단계');
    debug.add(cfg.debugVision,'yoloBoxes').name('YOLO 사람 박스');
    debug.add(cfg.debugVision,'inputRegion').name('MediaPipe 입력 범위');
    debug.add(cfg.debugVision,'bodyPoints').name('몸 관절 · 연결선');
    debug.add(cfg.debugVision,'faceLandmarks').name('얼굴 랜드마크');
    debug.close();
    const f1 = this.gui.addFolder("인식 소실 · 대기 동작");
    f1.add(cfg.presence, "faceLostHoldMs", 200, 3000, 50).name("얼굴 소실 유예 (ms)");
    f1.add(cfg.presence, "exitHoldMs", 0, 6000, 100).name("인식 종료 후 퇴장 대기 (ms)");
    f1.add(cfg.presence, "attractAfterMs", 1000, 60000, 500).name("대기 손짓 시작 (ms)");
    f1.close();
    const f2 = this.gui.addFolder("고개·표정 매핑 — 얼마나 크게 따라할지");
    f2.add(cfg.mapping, "autoNeutral").name("카메라 각도·뜬 눈 자동 기준").onChange(() => hooks.onFaceNeutral?.());
    f2.add({ calibrate: () => hooks.onFaceNeutral?.() }, "calibrate").name("화면 보고 눈 뜬 상태로 기준 다시 맞춤");
    const neutralHint = document.createElement("div");
    neutralHint.style.cssText = "padding:4px 8px;font-size:11px;line-height:1.5;color:#b9c2d0";
    neutralHint.textContent = "처음 잡힌 사람이 화면을 보고 눈을 뜬 채 약 1초 멈추면 고개·눈 기준을 맞춥니다. 이후 고개 숙이기와 깜빡임은 그대로 따라갑니다. 처음 자세가 잘못 잡혔으면 위 버튼으로 다시 맞추세요.";
    f2.$children.appendChild(neutralHint);
    f2.add(cfg.mapping, "yawGain", 0, 3, 0.05).name("좌우 고개 배율 (×)");
    f2.add(cfg.mapping, "pitchGain", 0, 3, 0.05).name("상하 고개 배율 (×)");
    f2.add(cfg.mapping, "rollGain", 0, 3, 0.05).name("갸웃 배율 (×)");
    f2.add(cfg.mapping, "headDeadzoneDeg", 0, 8, 0.1).name("고개 무시 범위 (°)");
    f2.add(cfg.mapping, "yawClampDeg", 10, 80, 1).name("좌우 최대 (°)");
    f2.add(cfg.mapping, "pitchClampDeg", 10, 60, 1).name("상하 최대 (°)");
    f2.add(cfg.mapping, "rollClampDeg", 5, 45, 1).name("갸웃 최대 (°)");
    f2.add(cfg.mapping, "smileGain", 0, 3, 0.05).name("웃음 배율 (×)");
    f2.add(cfg.mapping, "cornerSmileGain", 0, 30, 0.5).name("입꼬리↑ 웃음 배율 (×)");
    f2.add(cfg.mapping, "cornerFrownGain", 0, 40, 0.5).name("입꼬리↓ 시무룩 배율 (×)");
    f2.add(cfg.mapping, "mouthOpenGeoFrom", 0, 0.5, 0.01).name("입 벌림 시작 (입술간격, 입폭 대비)");
    f2.add(cfg.mapping, "mouthOpenGeoRange", 0.05, 1, 0.01).name("입 벌림 최대까지 폭");
    f2.add(cfg.mapping, "frownGain", 0, 8, 0.1).name("시무룩 배율 (×, 보조)");
    f2.add(cfg.mapping, "puckerDeadzone", 0, 0.9, 0.01).name("오므림 무시 범위 (0~1)");
    f2.add(cfg.mapping, "mouthBaselineSec", 2, 30, 1).name("입 무표정 기준 학습 (초)");
    f2.add(cfg.mapping, "jawGain", 0, 3, 0.05).name("입 벌림 배율 (×)");
    f2.add(cfg.mapping, "browGain", 0, 3, 0.05).name("눈썹 배율 (×)");
    f2.add(cfg.mapping, "blinkThreshold", 0.1, 0.95, 0.01).name("눈 감음 판정 (0~1, 낮을수록 잘 감음)");
    f2.add(cfg.mapping, "blinkOpenBelow", 0.05, 0.9, 0.01).name("눈 다시 뜸 판정 (0~1, 감음 판정보다 낮게)");
    f2.add(cfg.mapping, "blendDeadzone", 0, 0.3, 0.01).name("표정 무시 범위 (0~1)");
    f2.close();

    const f8 = this.gui.addFolder("상반신 — 몸통·팔 따라하기");
    f8.add({enabled:cfg.body.enabled&&cfg.pose.enabled}, "enabled").name("상반신 추적·미믹 (재시작)").onChange((on:boolean)=>{cfg.body.enabled=on;cfg.pose.enabled=on;});
    f8.add(cfg.body, "torsoYawGain", 0, 2, 0.05).name("몸 비틀기 배율 (×)");
    f8.add(cfg.body, "torsoRollGain", 0, 2, 0.05).name("몸 옆으로 기울기 배율 (×)");
    f8.add(cfg.body, "torsoPitchGain", 0, 2, 0.05).name("몸 앞뒤 숙이기 배율 (×)");
    f8.add(cfg.body, "torsoYawClampDeg", 0, 60, 1).name("비틀기 최대 (°)");
    f8.add(cfg.body, "torsoRollClampDeg", 0, 45, 1).name("옆 기울기 최대 (°)");
    f8.add(cfg.body, "torsoPitchClampDeg", 0, 45, 1).name("앞뒤 숙이기 최대 (°)");
    const legacyArms=f8.addFolder('팔 동작 설정');
    legacyArms.close();
    legacyArms.add(cfg.body,'armSevereOverlap').name('팔이 깊이 파묻힐 때만 보정');
    legacyArms.add(cfg.body, "elbowGain", 0, 2, 0.05).name("팔꿈치 굽힘 배율 (×)");
    legacyArms.add(cfg.body, "armRaiseMaxRad", 1, 3, 0.05).name("팔 드는 최대 각 (rad, 아래=0)");
    f8.add(cfg.body, "minVisibility", 0, 1, 0.05).name("관절 신뢰도 최소 (0~1)");
    f8.add(cfg.body, "lostHoldMs", 0, 3000, 50).name("몸 놓쳐도 유지 (ms)");
    f8.add(cfg.body, 'additionalSmoothing').name('MediaPipe 이후 추가 스무딩');
    f8.add(cfg.body, "minCutoff", 0.1, 5, 0.05).name("팔 부드러움 (작을수록 부드럽고 느림)").onChange(hooks.onSmoothingChange);
    f8.add(cfg.body, "beta", 0, 2, 0.01).name("팔 빠른 동작 반응 (클수록 빠름)").onChange(hooks.onSmoothingChange);
    f8.add(cfg.body, "responsiveArms").name("큰 팔 동작 빠르게 따라가기");
    f8.close();

    const f3 = this.gui.addFolder("떨림 보정 — 부드러움 vs 반응속도");
    f3.add(cfg.smoothing, "headMinCutoff", 0.1, 5, 0.05).name("고개 부드러움 (작을수록 부드럽고 느림)").onChange(hooks.onSmoothingChange);
    f3.add(cfg.smoothing, "headBeta", 0, 1, 0.005).name("고개 빠른 동작 반응 (클수록 빠름)").onChange(hooks.onSmoothingChange);
    f3.add(cfg.smoothing, "blendMinCutoff", 0.1, 5, 0.05).name("표정 부드러움").onChange(hooks.onSmoothingChange);
    f3.add(cfg.smoothing, "blendBeta", 0, 1, 0.005).name("표정 빠른 변화 반응").onChange(hooks.onSmoothingChange);
    f3.add(cfg.smoothing, "blinkMinCutoff", 0.5, 15, 0.5).name("눈 깜빡임 반응 (클수록 빠름)").onChange(hooks.onSmoothingChange);
    f3.close();

    const f4 = this.gui.addFolder("표정 판정 (로그·리액션용)");
    f4.add(cfg.expression, "smileThreshold", 0.1, 0.9, 0.01).name("웃음 판정 (0~1)");
    f4.add(cfg.expression, "surpriseJaw", 0.1, 0.9, 0.01).name("놀람: 입 벌림 ≥ (0~1)");
    f4.add(cfg.expression, "surpriseBrow", 0.1, 0.9, 0.01).name("놀람: 눈썹 ≥ (0~1)");
    f4.add(cfg.expression, "dwellMs", 0, 1000, 10).name("표정 유지 시간 (ms)");
    f4.close();

    const f6 = this.gui.addFolder("푸빌라 얼굴");
    f6.add(cfg.face, "mouthLineCm", 0.1, 1.2, 0.02).name("입선 굵기 (cm)");
    f6.add(cfg.face, "mouthHalfW", 1, 6, 0.1).name("입선 폭 (반폭 cm)");
    f6.add(cfg.face, "mouthRestCurve", -0.1, 0.2, 0.005).name("무표정 입선 휨 (+ 끝 올라감)");
    f6.add(cfg.face, "smileCurve", 0, 0.25, 0.005).name("웃을 때 휨 (‿)");
    f6.add(cfg.face, "frownWidth", 0.3, 1, 0.01).name("시무룩 입 폭 (무표정 대비 ×)");
    f6.add(cfg.face, "frownArcCm", 0, 2, 0.05).name("시무룩 입 둥글기 (︵ 높이, cm)");
    f6.add(cfg.face, "mouthOpenFrom", 0, 0.6, 0.01).name("이 이상 벌리면 'o' 입 (0~1)");
    f6.add(cfg.face, "mouthOHalfW", 0.3, 2.5, 0.05).name("'o' 입 반폭 (cm)");
    f6.add(cfg.face, "mouthOHalfH", 0.3, 3, 0.05).name("'o' 입 반높이 (cm)");
    f6.add(cfg.face, "closedEyeHalfW", 0.5, 4, 0.05).name("감은 눈 곡선 폭 (cm)");
    f6.add(cfg.face, "closedEyeCurve", -0.4, 0.4, 0.01).name("감은 눈 휨 (+ = ‿)");
    f6.add(cfg.face, "closedEyeDrop", -1.5, 1.5, 0.05).name("감은 눈 높이 (아래로 cm)");
    f6.add(cfg.face, "closedEyeLineCm", 0.1, 1.2, 0.02).name("감은 눈 굵기 (cm)");
    f6.add(cfg.face, "eyeScale", 0.3, 1.2, 0.01).name("눈알 크기 (×, 재시작)");
    f6.add(cfg.face, "eyePushCm", -1, 2, 0.05).name("눈 돌출 (cm, 재시작)");
    f6.add(cfg.face, "blushStrength", 0, 1, 0.05).name("볼터치 세기 (0 = 끔)");
    f6.add(cfg.face, "blushGrinFrom", 0, 1, 0.01).name("볼터치 시작 웃음 (0~1, 높을수록 활짝 웃어야)");
    f6.add(cfg.face, "blushGrinFull", 0, 1, 0.01).name("볼터치 최대 웃음 (0~1)");
    f6.add(cfg.face, "blushX", 5, 25, 0.1).name("볼터치 좌우 위치 (cm)").onChange(onC);
    f6.add(cfg.face, "blushY", 130, 155, 0.1).name("볼터치 높이 (cm)").onChange(onC);
    f6.add(cfg.face, "blushR", 1, 8, 0.1).name("볼터치 크기 (cm)").onChange(onC);
    f6.addColor(cfg.face, "blushColor").name("볼터치 색").onChange(onC);
    f6.add(cfg.face, "browEnabled").name("눈썹 획 (가이드 3D 엔 없음)");
    f6.add(cfg.face, "browOffsetY", 2, 10, 0.1).name("눈썹 높이 (눈 위 cm)").onChange(onC);
    f6.add(cfg.face, "lineCm", 0.2, 2, 0.05).name("눈썹 굵기 (cm)").onChange(onC);
    f6.close();

    const f7 = this.gui.addFolder("푸빌라 털·동작");
    f7.add(cfg.fur, "lengthCm", 0, 4, 0.05).name("털 길이 (cm)").onChange(onC);
    f7.add(cfg.fur, "freq", 1, 14, 0.1).name("털 가닥 촘촘함 (가닥/cm)").onChange(onC);
    f7.add(cfg.fur, "minDensity", 0, 0.9, 0.01).name("털 길이 들쭉날쭉 (0~0.9)").onChange(onC);
    f7.add(cfg.fur, "lean", 0, 1.5, 0.01).name("털 끝 눕기 (털 길이 대비)").onChange(onC);
    f7.add(cfg.fur, "thickness", 0.08, 0.6, 0.01).name("털 가닥 굵기 (가늘수록 결이 보임)").onChange(onC);
    f7.add(cfg.fur, "bumpCm", 0, 2, 0.01).name("털뭉치(몽글몽글) 입체감 (0 = 매끈)").onChange(onC);
    f7.add(cfg.fur, "tuftCm", 1, 10, 0.1).name("털뭉치 크기 (cm)").onChange(onC);
    f7.add(cfg.fur, "roughness", 0.3, 1, 0.01).name("털 광택 없음 정도 (1 = 무광)").onChange(onC);
    f7.add(cfg.fur, "rootShade", 0.3, 1, 0.01).name("털 뿌리 그늘 (작을수록 어둡게)").onChange(onC);
    f7.add(cfg.fur, "faceFurScale", 0, 1, 0.01).name("얼굴 털 길이 비율 (×)").onChange(onC);
    f7.add(cfg.fur, "shells", 0, 32, 1).name("털 층 수 (재시작, 성능 영향 큼)");
    f7.add(cfg.character, "bodyFollow", 0, 0.6, 0.01).name("몸 신호 없을 때 몸이 고개 따라감 (×)");
    f7.add(cfg.character, "enterDrop", 0, 15, 0.1).name("등장/퇴장 이동 거리");
    f7.add(cfg.character, "attractPeek", 0, 1, 0.01).name("유도 때 올라오는 정도 (0~1)");
    f7.add(cfg.character, "waveLiftRad", 0, 2, 0.01).name("손 흔들 때 팔 높이 (rad)");
    const onS = hooks.onSceneChange;
    const edge = this.gui.addFolder("합성 윤곽 — 고급");
    edge.add(cfg.filter,"edgeLo",0,.6,.01).name("털 끝 투명도 하한");
    edge.add(cfg.filter,"edgeHi",.2,1,.01).name("털 끝 투명도 상한");edge.close();

    const fv = this.gui.addFolder("화면 시점 — 직접 잡기");
    fv.add(cfg.scene, "pViewCenterCm", -100, 220, 0.5).name("시점 높이 (cm)").onChange(onS).listen();
    fv.add(cfg.scene, "pViewHeightCm", 25, 260, 0.5).name("줌 (보이는 높이 cm)").onChange(onS).listen();
    fv.add(cfg.scene, "pViewOffsetXcm", -80, 80, 0.5).name("좌우 이동 (cm)").onChange(onS).listen();
    fv.add(cfg.scene, "cameraYawDeg", -ORBIT_LIMITS.yaw, ORBIT_LIMITS.yaw, 0.5).name("좌우 회전 (°)").onChange(onS).listen();
    fv.add({centerFeet:()=>hooks.onCenterFeet?.()},'centerFeet').name('발 위치를 화면 중앙으로');
    fv.add({reset:()=>{resetCameraView(cfg.scene);onS();this.requestSave();}}, "reset").name("시점 초기화 (R)");
    fv.add(cfg.scene, "cameraTiltDeg", ORBIT_LIMITS.tiltMin, ORBIT_LIMITS.tiltMax, 0.5).name("카메라 위아래 각 (°, −=내려다봄)").onChange(onS).listen();
    fv.add({
      copy: () => {
        const r = (x: number) => Math.round(x * 10) / 10;
        const sc = cfg.scene;
        const v = { pViewCenterCm: r(sc.pViewCenterCm), pViewHeightCm: r(sc.pViewHeightCm), pViewOffsetXcm: r(sc.pViewOffsetXcm), cameraTiltDeg: sc.cameraTiltDeg, cameraYawDeg: sc.cameraYawDeg, aspect: "9:16" };
        const text = `푸빌라 시점 ${JSON.stringify(v)}`;
        navigator.clipboard?.writeText(text).then(
          () => this.toast("시점 값 복사됨 — 채팅에 붙여 넣으면 기본값으로 배포"),
          () => prompt("아래 값을 복사해 전달해 주세요", text),
        );
      },
    }, "copy").name("📋 시점 값 복사 (전달용)");
    fv.close();
    f7.close();
    const lighting = this.gui.addFolder("조명 — 밝기·위치");
    lighting.add(cfg.scene, "exposure", .4, 1.6, .01).name("전체 밝기 (노출)").onChange(onS);
    const lightHint = document.createElement('div');
    lightHint.textContent = '정면 구도 기준: 좌우 0°는 앞, −90°는 왼쪽, +90°는 오른쪽, ±180°는 뒤. 높이 90°는 머리 위입니다.';
    lightHint.style.cssText = 'padding:8px 10px;line-height:1.5;opacity:.75;font-size:11px';
    lighting.$children.appendChild(lightHint);
    const addLight = (role:LightRole, title:string, intensity:'keyLight'|'fillLight'|'rimLight'|'bounceLight', max:number) => {
      const folder = lighting.addFolder(title);
      folder.add(cfg.scene, intensity, 0, max, .01).name('밝기').onChange(onS);
      folder.addColor(cfg.scene.winterLightColors, role).name('색상 (겨울 배경)').onChange(onS);
      folder.add(cfg.scene.lightDirections[role], 'azimuth', -180, 180, 1).name('좌우 위치 (°)').onChange(onS).listen();
      folder.add(cfg.scene.lightDirections[role], 'elevation', role==='bounce'?-80:0, 90, 1).name('높이 각도 (°)').onChange(onS).listen();
      folder.close();
    };
    addLight('key', '주광', 'keyLight', 10);
    addLight('fill', '보조광', 'fillLight', 10);
    addLight('rim', '테두리광', 'rimLight', 5);
    addLight('bounce', '눈밭 반사광 (겨울)', 'bounceLight', 2);
    lighting.add(cfg.scene, 'hemiLight', 0, 2, .01).name('주변광 (그림자 밝기)').onChange(onS);
    lighting.addColor(cfg.scene.winterLightColors, 'sky').name('하늘 반사색 (겨울)').onChange(onS);
    lighting.addColor(cfg.scene.winterLightColors, 'ground').name('눈밭 반사색 (겨울)').onChange(onS);
    lighting.add(cfg.scene, 'envLight', 0, 1.5, .01).name('환경 반사').onChange(onS);
    lighting.add({reset:()=>{resetLightDirections(cfg.scene.lightDirections);onS();this.requestSave();}},'reset').name('조명 위치 초기화');
    lighting.close();
    const shadow = this.gui.addFolder("발밑 그림자 — 겨울 배경");
    shadow.add(cfg.scene.groundShadow, "enabled").name("그림자 표시").onChange(onS);
    shadow.add(cfg.scene.groundShadow, "opacity", 0, 1, .01).name("진하기").onChange(onS);
    shadow.add(cfg.scene.groundShadow, "width", .25, 3, .05).name("가로 크기 (×)").onChange(onS);
    shadow.add(cfg.scene.groundShadow, "depth", .25, 3, .05).name("앞뒤 크기 (×)").onChange(onS);
    shadow.add(cfg.scene.groundShadow, "softness", .25, 2, .05).name("가장자리 부드러움").onChange(onS);
    shadow.add(cfg.scene.groundShadow, "contact", 0, 1, .01).name("발 접점 진하기").onChange(onS);
    shadow.close();
    // 그릴 때마다 값을 읽으므로 따로 적용 호출 없음
    const snow = this.gui.addFolder("겨울 배경 눈");
    snow.add(cfg.scene.snow, "enabled").name("눈 내리기");
    snow.add(cfg.scene.snow, "amount", 0, 2, .05).name("양 (×)");
    snow.add(cfg.scene.snow, "speed", .2, 2, .05).name("속도 (×)");
    snow.close();

    const f5 = this.gui.addFolder("카메라·트래커 (재시작 필요)");
    if (import.meta.env.DEV) f5.add(cfg.camera, "deviceLabelIncludes").name("카메라 이름 (빈칸=기본)");
    f5.add(cfg.camera, "mirror").name("인식 입력 좌우반전 (출력 반전과 별개)");
    f5.add(cfg.camera,"inputRotation",{"0°":0,"90°":90,"180°":180,"270°":270}).name("카메라 입력 회전 (즉시 적용)");
    f5.add(cfg.tracker, "transposeMatrix").name("고개 축 뒤집힘 보정");
    f5.add(cfg.tracker, "delegate", ["GPU", "CPU"]).name("얼굴 추론 장치");
    f5.add(cfg.tracker, "inferenceEveryNFrames", 1, 4, 1).name("얼굴 추론 간격 (프레임)");
    f5.add(cfg.pose, "everyNFrames", 1, 4, 1).name("상반신 추론 간격 (프레임)");
    f5.close();

    // 값을 바꾸면 자동 저장 (개발 서버: public/config.json 에 바로 기록 → 새로고침해도 유지)
    this.gui.onFinishChange(() => this.requestSave());
    this.gui.add({ save: () => this.save(true) }, "save").name("지금 저장 (config.json)");
    this.gui.add({ reload: () => location.reload() }, "reload").name("재시작");

    window.addEventListener("keydown", (e) => {
      if(e.repeat||e.isComposing||e.ctrlKey||e.metaKey||e.altKey)return;
      if(e.target instanceof HTMLElement&&(e.target.isContentEditable||e.target.closest('input,textarea,select')))return;
      if (e.key === "d" || e.key === "D") this.toggle();
    });
    // 기본은 숨김 — d 키 또는 오른쪽 위 ⚙ 버튼(폰·태블릿)으로 열기
    const btn = document.createElement("button");
    btn.id = "overlayToggle";
    btn.classList.add("view-control");
    btn.textContent = "⚙";
    btn.title = "설정 열기/닫기 (D)";
    btn.style.order="5";
    btn.setAttribute("aria-label","설정");
    btn.onclick = () => this.toggle();
    document.getElementById("viewControls")!.appendChild(btn);
    this.visible = true;
    this.toggle();
  }

  private saveTimer = 0;
  private toastEl: HTMLDivElement | null = null;

  /** 연속 변경은 모아서 0.4초 뒤 한 번 저장 */
  requestSave(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.save(false), 400);
  }

  private async save(fallbackDownload: boolean): Promise<void> {
    const ok = await saveConfig(this.cfg);
    if (ok) this.toast("저장됨 — public/config.json (새로고침해도 유지)");
    else if (fallbackDownload) {
      downloadConfig(this.cfg);
      this.toast("서버 저장 불가 — config.json 을 다운로드했습니다. public/ 에 덮어쓰세요");
    } else this.toast("자동 저장 안 됨 (개발 서버가 아님) — '지금 저장'으로 다운로드");
  }

  private toast(msg: string): void {
    if (!this.toastEl) {
      this.toastEl = document.createElement("div");
      this.toastEl.style.cssText =
        "position:fixed;left:50%;top:14px;transform:translateX(-50%);background:rgba(0,0,0,.75);color:#fff;" +
        "font:13px system-ui;padding:8px 14px;border-radius:8px;z-index:20;transition:opacity .3s;pointer-events:none";
      document.body.appendChild(this.toastEl);
    }
    this.toastEl.textContent = msg;
    this.toastEl.style.opacity = "1";
    clearTimeout((this.toastEl as unknown as { _t: number })._t);
    (this.toastEl as unknown as { _t: number })._t = window.setTimeout(() => {
      if (this.toastEl) this.toastEl.style.opacity = "0";
    }, 1800);
  }

  toggle(): void {
    this.visible = !this.visible;
    document.body.classList.toggle("debug-hidden", !this.visible);
    document.getElementById("overlayToggle")?.setAttribute("aria-expanded", String(this.visible));
  }

  update(s: OverlayStats): void {
    if (!this.visible) return;
    const b = s.sig.blend;
    const top = Object.entries(b)
      .filter(([k]) => !k.startsWith("__"))
      .sort((a, c) => c[1] - a[1])
      .slice(0, 4)
      .map(([k, v]) => `${k}:${v.toFixed(2)}`)
      .join("  ");
    const body = s.body
      ? `팔 신뢰도 왼 ${s.body.armL.toFixed(2)} / 오 ${s.body.armR.toFixed(2)}   엉덩이 ${s.body.hips.toFixed(2)}`
      : "없음 (상반신 안 보임 또는 꺼짐)";
    this.statsEl.textContent =
      `상태      ${STATE_KO[s.snap.state] ?? s.snap.state}  ${(s.snap.elapsedMs / 1000).toFixed(1)}초째\n` +
      `속도      화면 ${s.renderFps.toFixed(0)}fps · 얼굴추론 ${s.inferFps.toFixed(0)}fps ${s.inferenceMs.toFixed(1)}ms · 상반신 ${s.poseMs.toFixed(1)}ms\n` +
      `얼굴      ${s.sig.faceCount}명  있음=${s.sig.present ? "O" : "X"}  가까움=${s.sig.near ? "O" : "X"}\n` +
      `          bboxH(얼굴 크기)=${s.sig.bboxH.toFixed(3)}  cx(가로 위치)=${s.sig.cx.toFixed(2)}\n` +
      `고개      좌우 ${s.sig.yaw.toFixed(1)}°  상하 ${s.sig.pitch.toFixed(1)}°  갸웃 ${s.sig.roll.toFixed(1)}°\n` +
      `기준      ${!this.cfg.mapping.autoNeutral ? "자동 보정 꺼짐" : b.__neutralReady ? "고개·뜬 눈 기준 완료" : "고개 추종 중 · 뜬 눈 기준 수집 중"}\n` +
      `상반신    ${body}\n` +
      // 입 판정 원값 — 다물었는데 'o' / 시무룩 안 됨 같은 문제는 이 줄로 확인
      `입        입술간격 ${(b.__dbgOpenRaw ?? 0).toFixed(3)} (무표정 ${(b.__dbgOpenBase ?? 0).toFixed(3)}, 'o' 기준 +${s.mouthOpenFrom.toFixed(2)})` +
      `  입꼬리 ${(b.__geoCorner ?? 0) >= 0 ? "+" : ""}${(b.__geoCorner ?? 0).toFixed(3)} (+웃음 / −시무룩)\n` +
      `표정      ${s.sig.expression}   ${top}\n` +
      `모델      ${s.modelSource}\n` +
      `[d] 오버레이 숨기기`;
  }
}
