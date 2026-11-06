# Codex 미믹 파이프라인

웹캠 → PersonTracker(YOLO 대상 선택) → PersonCrop → FaceTracker / PoseTracker → RecognitionGate(참여 단계) → SignalProcessor / BodyProcessor → MimicStateMachine → PuuvillaCharacter → Scene.

Face와 Pose는 같은 선택 인물의 ROI를 사용한다. 얼굴 위치로 대상을 다시 고정하는 별도 Lock-on과 영역 편집기는 제거했다.

서 있는 원본의 팔 가중치는 빌드 도구 `scripts/build-standing-rig.mjs`에서 `public/models/stand_connected_rig.json`으로 계산한다. 런타임은 원본 몸 정점과 일치하는지 검증한 뒤 가중치를 몸과 동일한 세분화로 보간한다. 원본 OBJ는 수정하지 않는다. `body.armRig=legacy`는 이전 공간 기반 가중치 비교용이다.

소유 경계·배포 규칙은 루트 AGENTS.md, 작업 환경은 CODEX_WORKSPACE.md, 팔 검증은 ARM_MIMIC.md를 따른다.

## 추론·렌더 계산 주기

- FaceRecovery는 같은 입력 프레임에서 좌표와 크기가 같은 확대 영역의 결과를 공유한다. 다음 프레임에서는 다시 계산하며, 서로 다른 영역·전체 화면 탐색은 유지한다.
- FaceTracker의 워커 전환은 결과 도착 횟수가 아닌 완료된 추론 시간으로 판단한다. 초기 3초 이후 최소 8개, 최근 최대 16개 표본 중 75% 이상이 125ms를 넘을 때 메인 추론으로 전환한다. 카메라 저속 입력·프레임 건너뛰기·숨겨진 탭 때문에 전환하지 않는다. 워커 종료·입력 회전 중 뒤늦게 생성된 ImageBitmap은 닫는다.
- 메인 루프는 매 프레임 관절 보간과 표정을 갱신하되 표면 계산을 미룬다. Scene.beforeRender → CharacterRig.prepareRender는 실제 소스 렌더 직전에 실행한다. 유화는 PaintCadence 통과 후 호출하므로 12fps 그림을 위해 60fps 표면을 계산하지 않는다. 일반 렌더·PaintFilter·분할 비교는 각 렌더 때 준비한다. 기존 apply 호출은 기본적으로 즉시 계산하므로 개발 도구와 호환된다.

검사: npm run pipeline:check, npm run performance:check 및 기존 얼굴·입력 전환·팔 회귀 검사. 실제 모델에 600개 합성 입력을 넣은 검사에서 120개 표시 시점의 관절 보간은 동일했고, 표면 재계산은 280회에서 59회로 줄었다. 최대 정점 오차 0.0000153cm, 법선 성분 오차 0.000000015는 기존 표면 검사의 허용오차 이내다. 정지 시 기존 1e-9 행렬 캐시의 갱신 시점이 달라 미세한 수치 차이가 생긴다. 이 수치는 계산 횟수 검증이며 실시간 카메라 FPS나 GPU 성능 측정은 아니다.

## 고정 세로 화면과 운영 UI

출력은 중앙 9:16 무대에 맞추고 남는 영역은 검은 레터박스로 유지한다. Scene, 배경 CanvasTexture, 유화 출력 캔버스가 같은 무대 크기를 사용한다. 창 크기가 바뀌어도 카메라 투영비와 시점은 유지하며, 드래그 이동량은 무대 높이 기준으로 계산한다.

설정 파일 및 브라우저 저장값을 읽은 뒤 presentation.ts가 세로 화면과 서 있는 목도리 푸빌라를 고정한다. 이전 의상 저장값과 메인 페이지의 char/seat/sit/arm 파라미터는 모델을 바꾸지 않는다. 유화 외의 기존 PaintFilter는 메인 설정에서 비활성화한다. 개발 실험 페이지는 별도로 유지한다.

화면 버튼은 전체화면 / 팔레트 / 출력 좌우반전 / 배경 / 설정 다섯 개다. 팔레트는 조정 패널을 여닫고 필터 사용 여부는 패널 체크박스로 정한다. 카메라 입력 회전은 설정 안으로 이동했다. 입력 좌우반전은 인식 좌표, 출력 좌우반전은 캐릭터 화면만 바꾸므로 별도로 유지한다.

설정 정리: 가로 구도·비율·의상·스카프 줄무늬·기존 그림 필터·현재 연결형 리그에 적용되지 않는 자유 팔 메뉴를 제거했다. 화면 확대/이동과 겹치는 모델 크기·초점 높이는 운영 메뉴에서 제거했다. 상반신 추론/미믹 토글은 하나로 묶었으며 재시작 시 적용된다. 고개/표정 입력 매핑과 얼굴 외형 조절은 역할이 달라 유지한다.

겨울 배경은 public/bg/winter-village-square-dusk-bright.png의 세로 마을 광장이다. 기존 구도를 유지하며 첨부 레퍼런스에 맞춰 중간 밝기를 높인 눈밭과 청보라 그림자, 부드러운 살구·금빛을 섞은 저녁 톤을 벽/바닥에 투영한다. 이전 원본은 보관한다. 조명과 편집 프롬프트는 DUSK_ART_DIRECTION.md를 참고한다.

검사: npm run presentation:check. 브라우저에서 가로·세로·좁은 화면의 비율/구도/버튼 영역과 유화 전환, 배경 전환을 확인한다. 실제 카메라 인식 파이프라인은 이번 변경 범위에 포함하지 않는다.

### 사진 배경 접지와 시점 조작

- `cameraView.ts`의 초기 구도는 중심 높이 95 cm, 보이는 높이 250 cm, 좌우 0, 회전 0°, 내려다보기 6°다. 좌클릭/한 손가락은 푸빌라 몸 중심 회전, 휠클릭은 카메라 평면 이동, 휠은 줌, 두 손가락은 이동+줌이다. R 또는 설정 > 화면 시점 > 시점 초기화로 다섯 시점 값만 초기화한다. 같은 폴더의 `발 위치를 화면 중앙으로` 버튼은 바닥의 모델 원점을 카메라 평면 이동으로 중앙에 맞춘다. 회전·줌과 모델 위치는 유지하며, 이후 수동 이동과 초기화가 가능하다. 다른 수동 시점 조작과 마찬가지로 이 동작은 현재 화면에 적용된다.
- `groundedBackdrop.ts`는 동일한 사진을 바닥과 뒤쪽 면에 초기 카메라 기준으로 투영한다. 푸빌라·바닥·배경·접지 그림자가 하나의 카메라로 렌더링되며 유화 필터에도 함께 들어간다. 별도 화면 고정 배경 캔버스는 이 모드에서 그리지 않는다.
- 원본은 한 장의 사진이므로 실제 360° 환경 복원이 아니다. 사진 왜곡을 줄이기 위해 좌우 회전 ±25°, 내려다보기 2–12° 범위로 제한한다. 접지 그림자는 발밑의 부드러운 정적 그림자이며 실시간 전신 그림자 맵을 추가하지 않는다.
- `npm run camera:view:check`는 회전 중심/거리, 카메라 기준 이동, 초기화 범위, 사진 투영과 바닥 높이를 확인한다.

### 조명 배치 조절

`scene.lightDirections`에 주광·보조광·테두리광의 좌우 각도(azimuth)와 높이 각도(elevation)를 저장한다. 초기 배치는 왼쪽 위 주광(−40°/40°), 오른쪽 낮은 보조광(55°/15°), 오른쪽 뒤 테두리광(130°/25°)이다. 설정 > 조명 — 밝기·위치에서 즉시 조절하며, 위치 초기화는 밝기나 카메라 시점에 영향을 주지 않는다. 광원 방향은 장면에 고정되므로 카메라 회전과 함께 돌지 않는다. 주변광과 환경 반사에는 위치 조절을 제공하지 않는다.

### 겨울 배경 눈

- `snowfall.ts`는 푸빌라 등 뒤(z −2)부터 사진 벽 앞(z −11.4)까지의 장면 공간에 눈 입자 하나(`THREE.Points`)를 둔다. 카메라 회전·이동·줌을 사진 배경과 똑같이 따르고, 캐릭터가 깊이로 가리므로 얼굴·몸 위에는 눈이 그려지지 않는다. 바닥 근처에서 흐려지며 쌓이지 않는다.
- 위치·흔들림은 셰이더에서 계산하고 JS는 위상 하나만 진행한다. 원본 장면을 실제로 그릴 때(`onBeforeRender`)만 진행하므로 유화 필터의 초당 그림 수에 그대로 맞고 별도 루프가 없다. 모든 눈송이가 20분 주기 안에 정수 번 떨어지고 흔들려 주기가 넘어가도 이음매가 없다.
- 유화는 붓 크기로 다시 칠해 큰 점이 속 빈 고리로 남으므로, 유화가 켜지면 원본 눈을 작고 또렷하게(×0.6) 그려 작은 붓 터치로 칠해지게 한다. 겨울 사진이 보일 때만 표시되고 주황 배경에서는 숨는다.
- `scene.snow`: 켜기 · 양(×, 0~2, 기본 900개) · 속도(×). 설정 > 겨울 배경 눈. `npm run snowfall:check`는 실제 캐릭터 등보다 뒤·사진 벽보다 앞, 이음매 없는 주기, 표시 조건과 양을 확인한다.


## YOLO person ROI (2026-11)

- A local YOLO11n worker runs at most once per configured interval (100 ms default),
  with one frame in flight. WebGPU preferred, worker WASM fallback. Errors/timeouts
  stop acquisition and show a retry state; they do not silently track the full crowd.
- PersonSelection ranks eligible camera-normalized person boxes by area. A 10%
  larger challenger must remain continuously larger for 800 ms by default (both
  adjustable). Missing/changed challengers restart the timer; current-person loss
  cannot bypass an already pending switch. The current target has a 500 ms loss lease.
  A computation submitted before lease expiry can finish for at most 1000 ms; a
  completed missing-person result cannot borrow that grace. Late YOLO results
  beyond 1000 ms are discarded. Receipt time starts the lease, while source time
  orders observations and challenger dwell. An expired selection stops recognition
  without rebuilding MediaPipe; a matching return within 2 seconds retains the
  graph. A different person or a long absence starts a new tracking epoch.
  This is a box-area heuristic, not physical distance or biometric identity.
- PersonCrop keeps a fixed camera-sized canvas (long side capped at 1280 px),
  with the original aspect/coordinates. It clears to black and copies only the
  selected person's padded rectangle in place. Padding expands immediately and
  contracts gradually; box updates never resize or translate the inference input.
  Face recovery tries the full masked frame first and enlarges only after failure.
  A healthy recovery crop stays fixed, without periodic full-frame probes on the
  same VIDEO graph; an observed head leaving it can reframe after a failed sample.
- Every in-flight face/pose request carries its own ROI. Results are remapped to
  full rotated camera coordinates at delivery, never using a newer ROI. Pose world
  coordinates stay unchanged. Nested face-recovery landmarks are remapped too.
- Selection revision/rotation resets cached observations, neutral calibration,
  filters, MediaPipe tracking graph and presence confirmation. Old epoch responses
  are ignored. Overlapping people inside one crop can still confuse a single-person
  landmarker; no biometric identity or segmentation is claimed.
- PresenceConfirmation requires at least 3 fresh matching face observations over
  350 ms; a missing observation restarts acquisition. Held/cached results cannot
  start a session. Existing face-loss grace sustains an acquired session.
- Developer settings expose detector threshold/cadence, switch ratio/time,
  ROI padding/loss grace and face-confirmation time. Independent preview toggles
  draw YOLO candidates/selected box, unmasked input rectangle, pose joints/edges and face
  landmarks. All overlays use the rotated source coordinates and preview mirror.
  Face point arrays are only transferred when that debug overlay is visible.
- Offline YOLO/ORT assets are versioned in public/. Normal Vite/portable builds
  include them. Legacy single-HTML export explicitly disables YOLO, retaining the
  previous full-frame path; use a local server build for person ROI tracking.
- Check: npm run person:roi:check. Covers switch/loss, arm expansion,
  fresh-only acquisition, ROI/world-coordinate mapping, YOLO layout/NMS.

겨울 조명 색상은 `scene.winterLightColors`에 저장한다. 부드러운 크림색 주광과 청보라 보조광, 은은한 금빛 테두리광을 사용한다. 기본 세기는 주광 1.95 / 보조광 1.3 / 테두리광 2.4 / 눈밭 반사광 0.3 / 주변광 0.9 / 환경 반사 0.07, 노출 1이다. 설정에서 광원별 색상과 하늘·눈밭 반사색을 조절할 수 있으며, 단색 배경에서는 기존 중립색을 사용한다.

눈밭 반사광(`scene.bounceLight`, 기본 0.5)은 겨울 배경에서만 켜지는 추가 방향광이다. −15°/−35° 아래 방향의 옅은 푸른빛(`#d8def7`)으로 하체와 턱 아래를 보완하고 주변광은 1.0으로 낮춘다. 추가 그림자 맵이나 렌더 패스는 만들지 않는다. 발밑 그림자는 기존 투명 평면 하나에 넓은 확산 그림자와 고정 발 접점을 합성하며, `scene.groundShadow.contact`로 접점 진하기를 조절한다. 가로·앞뒤 크기와 부드러움은 확산 부분을 조절하고 발 접점 위치·크기는 유지한다.

## 참여 범위와 0 / 1 / 2 단계

관상 키오스크 PickPod의 YOLO 선택과 인식 준비/소실 유예 분리를 참고했다. 해당 프로젝트의 bottom+IoU 점수·실루엣 마스크를 그대로 옮기지는 않았다. 이 프로젝트는 상반신 상황에 맞춰 박스 면적, 연속 후보 유지 시간, 직사각형 ROI를 사용한다.

- 상하좌우 마진은 회전·미러가 반영된 카메라 미리보기 좌표 기준이다. 사람 박스 중심과 준비 최소 면적으로 YOLO 후보를 거르고, 얼굴 중심도 인식 단계에서 범위 안인지 확인한다. 팔은 범위 밖으로 뻗을 수 있다. 드래그로 사람을 고정하는 기능은 없다. D 모드에서 인식 범위 표시를 켜면 미리보기의 가장자리·모서리를 드래그해 마진을 조절하고, 안쪽을 드래그해 범위를 이동한다. 표시 좌표 기준으로 각 마진은 0~45%이며, 드래그 종료 시 저장하고 설정 슬라이더에도 즉시 반영한다. 상태 문구는 영상 아래에 표시해 하단 손잡이를 가리지 않는다.
- 0: 후보 없음 / 마진 밖 / 사람 면적이 준비 기준 미만.
- 1: 참여 후보는 있지만 인식 크기·얼굴·연속 확인 조건 미충족. FSM PREPARE에서 고개를 천천히 좌우로 둘러보며 사람 표정·몸은 따라하지 않는다.
- 2: 사람 면적과 얼굴 높이가 기준 이상이고 얼굴이 최소 3회·350ms 연속 확인됨. ENTER → MIMIC. 유지 중 크기 기준은 85%까지 여유를 두며 얼굴 소실은 기존 유예 적용. 대상 전환 시 확인·중립 보정·MediaPipe 추적 상태를 모두 초기화한다.
- 기본값: 좌우 마진 5%, 상하 2%, 준비 사람 면적 2%, 인식 사람 면적 8%, 얼굴 높이 영상 짧은 변의 6%, 준비 고개 좌우 18°. 크기는 실측 거리값이 아니며 설치 카메라에서 조절한다.
- 설정: 인식 설정 → 참여 범위 · 단계. 디버그는 허용 범위(회색/노랑/초록), 단계 번호, 실제 사람·얼굴 크기, YOLO 전환 후보 진행률을 표시한다.
- 오래된 lockZone, mimicOnLock, 거리/중앙 조건 및 criterion 저장값은 로드 시 제거한다. YOLO를 명시적으로 끈 경우만 전체 영상 Face/Pose 1명 추적을 사용한다.
- 검사: person:roi:check, recognition:check, face:freshness:check, face:continuity:check, arm:dropout:check. 기존 얼굴 영역 고정·BodyTargetLock 전용 검사는 새로운 소유권·참여 단계 검사로 대체했다.

Pose 추가 필터 비교: `body.additionalSmoothing` 기본값은 true다. 설정 > 상반신 > MediaPipe 이후 추가 스무딩으로 관절·손 방향의 One Euro 필터를 켜고 끌 수 있다. 다시 켤 때 이력을 비워 오래된 자세와 섞이지 않게 한다. D 모드 관절 점은 원래부터 BodyProcessor 이전 MediaPipe 좌표(ROI를 원본 영상 좌표로 복원한 값)를 표시하므로 이 토글의 영향을 받지 않는다.

## 갤러리 필터 업데이트

유화는 galleryFilter.ts가 로드한 공식 갤러리 모듈을 oilFilter.ts에서 실행한다. 조절 UI는 원격 스키마로 생성한다. D 모드에서 버전 확인·시험 렌더·적용·복원이 가능하다. 저장 형식과 배포 지원은 [FILTER_UPDATES.md](FILTER_UPDATES.md)를 참고한다.

## 배경 심도와 짧은 털결

`scene.backgroundFocus`는 겨울 사진에만 적용하는 심도 근사다. 기본 enabled=true, strength=24(1080px 사진 폭 기준 커널 반경), 설정의 배경 심도(DOF) 폴더에서 0~40으로 조절·저장한다. backgroundFocus.ts는 선형 색공간에서 가로/세로 가우시안 블러 2패스를 수행하고 결과를 캐시한다. 사진/강도가 바뀌거나 WebGL 컨텍스트가 복구될 때만 재생성하며 평상시 추가 블러 렌더는 없다. 캐릭터 뒤 30~200cm 구간에서 선명한 사진과 흐린 사진을 점차 혼합한다. 푸빌라·발 접점·전경 바닥에는 블러를 적용하지 않는다. 실제 렌즈의 조리개 보케나 전체 장면 깊이 기반 DOF가 아니며 눈 파티클도 같은 30~200cm 거리 구간을 공유한다. 먼 눈은 점 크기와 부드러운 가우시안 분포를 넓히고 면적에 반비례해 불투명도를 낮춰, 밝은 흰 원으로 부풀지 않게 한다. 심도 끄기·강도 0은 기존 눈 표현으로 돌아온다. 눈 심도는 기존 GPU 점 셰이더 안에서 처리하므로 추가 렌더 패스가 없다. 배경도 기존 유화 원본 렌더를 거치므로 붓 질감이 남는다.

털은 기존 2.9cm에서 1.1cm, 얼굴은 그 0.75배로 줄였다. 14개 셸은 유지하고 subpixel 가닥의 픽셀 점유율을 보정해 AA 폭이 털을 부풀리는 현상을 줄였다. 픽셀 크기보다 작은 표면 결은 점차 줄이는 짧은 방향성 명암 결을 추가했으며 기존 털뭉치 세기(bumpCm)로 함께 조절한다. 기본 freq=3.4, minDensity=.28, lean=.45, thickness=.34, bumpCm=1.2, tuftCm=2.2, rootShade=.8. 이전 공개 설정은 lengthCm=2.9, freq=2.9, minDensity=.38, lean=.47, thickness=.41, bumpCm=.8, tuftCm=4.5, rootShade=.72, faceFurScale=1이며 이전 셰이더는 커밋 927c0ac에 남아 있다.

검증: tsc/vite, pipeline:check, camera:view:check, presentation:check 통과. 브라우저에서 유화 켜기/끄기, 회전, 얼굴 확대, GL 오류 없음 확인. 블러 재생성은 동일 설정 0패스, 강도 변경 2패스, 끄기/다시 켜기 0패스로 확인했다.
