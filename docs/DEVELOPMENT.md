# 개발과 빌드

[README](../README.md) · [운영 가이드](OPERATOR_GUIDE.md) · [파라미터 창](PARAMETERS.md)

## 구성

TypeScript + Vite를 사용하며 Three.js가 캐릭터를 렌더링합니다. YOLO 대상 선택과 MediaPipe 얼굴·상반신 추적 결과를 신호 처리·상태 전환·캐릭터 매핑에 전달하고, 유화 필터로 최종 화면을 처리합니다.

| 경로 | 역할 |
| --- | --- |
| `src/main.ts` | 부팅, 카메라·추론·상태·렌더 연결 |
| `src/config.ts`, `public/config.json` | 설정 타입·기본값·저장 로직 / 배포할 튜닝값 |
| `src/overlay.ts`, `src/viewControls.ts`, `src/cameraPreview.ts` | 설정창, 화면 조작, 카메라 디버그 |
| `src/personTracker.ts`, `src/recognitionGate.ts` | 참여 대상 선택과 인식 단계 |
| `src/tracker.ts`, `src/poseTracker.ts`, `src/*Worker.ts` | 얼굴·포즈·사람 추론과 워커 |
| `src/signals.ts`, `src/body.ts`, `src/state.ts` | 신호 보정, 몸 동작, 상태 전환 |
| `src/character/` | 캐릭터·표정·팔 리깅 |
| `src/scene.ts`, `src/lighting.ts`, `src/snowfall.ts` | 장면·조명·눈 연출 |
| `src/galleryFilter.ts`, `src/galleryControls.ts`, `public/filter/current.json` | 유화 연동·조절 UI·적용 패키지 |
| `public/models/`, `public/mediapipe/wasm/` | 모델과 추론 런타임 |
| `scripts/`, `dev/` | 빌드·검증 스크립트, 개발 실험 페이지 |
| `docs/`, `docs/arm-review/` | 문서와 검증 이미지·영상·수치 기록 |

## 설치와 실행

Node.js 24 계열에서 `npm ci` → `npm run fetch-models` → `npm run dev` 순으로 실행합니다. `postinstall`은 설치된 MediaPipe 패키지의 WASM을 복사합니다. 얼굴·포즈 `.task` 모델과 WASM은 Git에 없으므로 새 PC에서 준비해야 합니다.

개발 서버는 `127.0.0.1:5175`, 미리보기는 포트 `4175`를 사용하며 포트 점유 시 다른 포트로 자동 이동하지 않습니다. HMR은 꺼져 있으므로 코드 변경 후 직접 새로고침합니다. `config.json` 저장은 페이지를 자동 새로고침하지 않습니다.

`src/presentation.ts`는 세로 9:16, 서 있는 푸빌라와 크리스마스 의상으로 화면을 고정합니다. 과거 설정의 모델·가로 배치 선택으로 이 구성이 바뀌지 않습니다.

## 빌드와 패키지

| 명령 | 결과·용도 |
| --- | --- |
| `npm run build` | 타입 검사 후 `dist/` 생성 |
| `npm run preview` | `dist/` 확인용 Vite 서버 |
| `npm run build:single` | 빌드 후 `release/pubilla-mimic.html` 생성 |
| `npm run build:portable` | Windows 로컬 실행 패키지. 현재 출력 이름 `release/Puuvilla-v48-local` |
| `npm run kiosk:win` / `npm run kiosk:mac` | 플랫폼별 키오스크 실행 스크립트 |
| `npm run deploy` / `npm run deploy:preview` | 기존 로컬 호스팅용 배포 스크립트 |
| `npm run serve` | 기존 호스팅 포인터가 가리키는 빌드를 제공하는 서버 |

일반 빌드는 `index.html`을 직접 여는 대신 HTTP 서버로 제공합니다. Portable은 현재 Node 바이너리를 `node.exe`로 복사하는 Windows용 구성입니다. 출력 폴더가 이미 있으면 중단하므로 새 패키지를 만들 때 출력 이름부터 조정합니다.

`deploy`와 `serve`는 저장소 옆 `pubilla-mimic-codex-hosting` 및 버전 포인터를 사용하는 기존 환경용입니다. 새 PC에서는 경로·대상 서버를 먼저 확인합니다. GitHub 푸시만으로 서버가 배포되지는 않습니다. 이전 배포·복구 이력은 [연속 검토 기록](CONTINUOUS_REVIEW.md)에 있습니다.

## 검증 명령 선택

| 변경 영역 | 명령 |
| --- | --- |
| 타입·빌드 | `npm run typecheck`, `npm run build` |
| 인식 단계·참여 마진 | `npm run recognition:check`, `npm run recognition:margins:check` |
| 카메라 시작·회전 | `npm run camera:check`, `npm run camera:rotation:check` |
| 얼굴 복구·연속성 | `npm run face:recovery:check`, `npm run face:continuity:check` |
| 팔 추적·몸 소실 | `npm run rig:check`, `npm run arm:dropout:check` |
| 렌더·추론 스케줄 | `npm run performance:check`, `npm run pipeline:check` |
| 화면·시점·눈 | `npm run presentation:check`, `npm run camera:view:check`, `npm run snowfall:check` |
| 유화 패키지 | `npm run filter:check` |
| 공식 서버와 필터 비교 | `npm run filter:check:live` — 네트워크 사용, 운영 파일 변경 없음 |

전체 명령은 [package.json](../package.json)을 기준으로 합니다. 수치 회귀 검사와 별도로 실제 카메라·GPU 렌더 및 현장 조명·참여 거리도 확인합니다.
