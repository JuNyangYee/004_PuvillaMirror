# Codex 미믹 파이프라인

웹캠 → FaceTracker → SignalProcessor(대상 얼굴) → MimicStateMachine → 표정 매핑 → PuuvillaCharacter → Scene.

같은 웹캠 → PoseTracker → BodyProcessor(대상 얼굴과 일치하는 몸, 미러링·스무딩·팔별 가림 유지) → PuuvillaCharacter.solveArm → 어깨/팔꿈치 본 → 몸·털 렌더.

서 있는 원본의 팔 가중치는 빌드 도구 `scripts/build-standing-rig.mjs`에서 `public/models/stand_connected_rig.json`으로 계산한다. 런타임은 원본 몸 정점과 일치하는지 검증한 뒤 가중치를 몸과 동일한 세분화로 보간한다. 원본 OBJ는 수정하지 않는다. `body.armRig=legacy`는 이전 공간 기반 가중치 비교용이다.

소유 경계·배포 규칙은 루트 AGENTS.md, 작업 환경은 CODEX_WORKSPACE.md, 팔 검증은 ARM_MIMIC.md를 따른다.

## 추론·렌더 계산 주기

- FaceRecovery는 같은 입력 프레임에서 좌표와 크기가 같은 확대 영역의 결과를 공유한다. 다음 프레임에서는 다시 계산하며, 서로 다른 영역·전체 화면 탐색은 유지한다.
- FaceTracker의 워커 전환은 결과 도착 횟수가 아닌 완료된 추론 시간으로 판단한다. 초기 3초 이후 최소 8개, 최근 최대 16개 표본 중 75% 이상이 125ms를 넘을 때 메인 추론으로 전환한다. 카메라 저속 입력·프레임 건너뛰기·숨겨진 탭 때문에 전환하지 않는다. 워커 종료·입력 회전 중 뒤늦게 생성된 ImageBitmap은 닫는다.
- 메인 루프는 매 프레임 관절 보간과 표정을 갱신하되 표면 계산을 미룬다. Scene.beforeRender → CharacterRig.prepareRender는 실제 소스 렌더 직전에 실행한다. 유화는 PaintCadence 통과 후 호출하므로 12fps 그림을 위해 60fps 표면을 계산하지 않는다. 일반 렌더·PaintFilter·분할 비교는 각 렌더 때 준비한다. 기존 apply 호출은 기본적으로 즉시 계산하므로 개발 도구와 호환된다.

검사: npm run pipeline:check, npm run performance:check 및 기존 얼굴·입력 전환·팔 회귀 검사. 실제 모델에 600개 합성 입력을 넣은 검사에서 120개 표시 시점의 관절 보간은 동일했고, 표면 재계산은 280회에서 59회로 줄었다. 최대 정점 오차 0.0000153cm, 법선 성분 오차 0.000000015는 기존 표면 검사의 허용오차 이내다. 정지 시 기존 1e-9 행렬 캐시의 갱신 시점이 달라 미세한 수치 차이가 생긴다. 이 수치는 계산 횟수 검증이며 실시간 카메라 FPS나 GPU 성능 측정은 아니다.
