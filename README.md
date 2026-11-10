# Puvilla Mirror — 푸빌라 미러

웹캠 앞 참여자의 고개·표정·상반신 움직임을 3D 캐릭터 푸빌라가 실시간으로 따라 하는 전시용 거울 인터랙션입니다. 겨울 마을 배경, 크리스마스 목도리, 유화 효과를 9:16 세로 화면에 합성합니다.

## 주요 기능

- YOLO로 참여 대상 한 명을 선택하고, 참여 범위·사람 크기·얼굴 확인을 통해 인식 단계를 전환합니다.
- MediaPipe Face/Pose Landmarker로 고개, 눈 깜빡임·윙크, 웃음·입 벌림, 몸통·팔 움직임을 추적합니다.
- 대기 → 유도 → 인식 준비 → 등장 → 따라하기 → 퇴장 흐름과 추적 소실 유예를 제공합니다.
- 카메라 입력 회전·반전, 캐릭터 출력 반전, 시점·조명·눈·그림자·유화 효과를 조절합니다.
- 설정 패널, 카메라 인식 디버그, 웹캠 없는 시뮬레이션, 키오스크 모드를 제공합니다.

## 시작하기

Node.js 24 계열과 npm, 웹캠 및 WebGL2를 지원하는 브라우저를 사용합니다.

```bash
git clone https://github.com/JuNyangYee/004_PuvillaMirror.git
cd 004_PuvillaMirror
npm ci
npm run fetch-models
npm run dev
```

`http://localhost:5175/`에서 카메라 권한을 허용합니다. `npm ci`는 MediaPipe WASM을 복사하고, `fetch-models`는 얼굴·포즈 모델을 다운로드합니다. 웹캠 없이 확인하려면 `http://localhost:5175/?sim=1`로 접속합니다.

`D`로 파라미터 창을 열고, 팔레트 버튼으로 유화 효과를 조절합니다. `F`는 화면 아이콘 표시/숨김, `R`은 시점 초기화입니다. 전체화면은 전체화면 버튼을 사용합니다.

## 문서

| 문서 | 내용 |
| --- | --- |
| [운영 가이드·단축키](docs/OPERATOR_GUIDE.md) | 실행 순서, 버튼, 키보드·마우스·터치, 시뮬레이션, 문제 해결 |
| [파라미터 창 안내](docs/PARAMETERS.md) | 설정 폴더별 역할, 유화·카메라 조절, 저장 방식 |
| [개발·빌드 안내](docs/DEVELOPMENT.md) | 구조, 명령어, 모델 준비, 검증과 배포 |
| [유화 업데이트](docs/FILTER_UPDATES.md) | 패키지 확인·시험·적용·복원과 구현 기록 |
| [팔 미믹](docs/ARM_MIMIC.md) / [팔 추적](docs/ARM_TRACKING.md) | 리깅·추적 구현과 검증 |
| [3D 가이드](docs/PUUVILLA_3D_GUIDE.md) / [에셋 인계](docs/ASSET_HANDOFF.md) | 캐릭터 외형과 자산 기록 |
| [연속 검토 기록](docs/CONTINUOUS_REVIEW.md) | 기존 개발·검증·배포 이력 |
| [초기 인계](docs/HANDOFF.md) / [작업 환경 기록](docs/CODEX_WORKSPACE.md) | 과거 작업 환경 참고 |

새 운영 문서는 현재 소스를 기준으로 작성했습니다. 기존 인계·검토 기록의 버전명, 경로, 포트는 당시 환경을 설명하므로 현재 실행은 위 시작하기와 개발 안내를 따릅니다.

## 자주 쓰는 명령

| 명령 | 용도 |
| --- | --- |
| `npm run dev` | 개발 서버, 기본 포트 5175 |
| `npm run build` | 타입 검사 후 `dist/` 빌드 |
| `npm run preview` | 빌드 결과 확인, 기본 포트 4175 |
| `npm run typecheck` | 타입 검사 |
| `npm run filter:check` | 유화 업데이트 회귀 검사 |
| `npm run visitor:check` | 방문자 인식 단계 회귀 검사 |
| `npm run performance:check` | 렌더·추론 성능 관련 로직 검사 |

개발 서버의 튜닝값은 `public/config.json`에 저장됩니다. 빌드된 화면은 브라우저별로 설정을 저장합니다. 시점·출력 반전 등의 공용 저장 예외는 [설정 저장 안내](docs/PARAMETERS.md#설정-저장과-재시작)를 확인하세요.

`node_modules/`, `dist/`, `release/`, 다운로드한 `.task` 모델 및 MediaPipe WASM은 Git에서 제외됩니다. 저장소 푸시와 전시 서버 배포는 별도 작업입니다.
