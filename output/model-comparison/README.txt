기존 모델 / v4 모델 동일 자세 비교 — 2026-11-13

upper-body: 첨부 이미지처럼 목·어깨·목도리 중심 상체 확대본
full-body: 손끝과 발까지 확인하는 전신 버전

각 폴더:
model-compare-overview.png: 시점별 OLD / V4를 옆에 배치한 전체 비교표
model-compare-original.png: 기존 모델 7자세 × 4시점
model-compare-v4.png: v4 모델 7자세 × 4시점
model-compare-01~07.png: 자세별 큰 비교 이미지 (윗줄 기존, 아랫줄 v4)

시점 순서: 정면 / 측면 / 후면 / 위쪽 55도
자세 순서:
01 기본
02 양팔 옆으로 벌리기
03 양팔 위로 들기
04 만세
05 한 팔 들기
06 양팔 위·앞으로 들기
07 양팔 앞으로 뻗기

비교 조건:
기존: public/models/pu_stand.obj + public/models/muffler_fit.bin
v4: public/models/pu_v4.obj + public/models/pu_muffler_v4.bin
동일한 현재 앱 리그, 자세 입력, 중립 표정, 조명, 카메라, 배율을 사용했습니다.
v4는 현재 적용된 짙은 빨강/크림 팔레트입니다. 기존 목도리는 기존 파일의 정점 색입니다.
유화 효과와 털 셸 레이어를 끄고 실제 런타임 메시를 렌더링했습니다.
Blender 원본의 IK/실시간 Shrinkwrap 결과 비교가 아니라 웹 앱에 적용된 모델의 비교입니다.
각도 표기는 입력 자세 각도이며, 리타게팅 이후 본의 실제 회전값과는 다를 수 있습니다.
상체 확대본은 상세 확인을 위해 팔끝과 하체가 일부 잘릴 수 있습니다. 전신 버전을 함께 확인하세요.

재현: npm run dev → /dev/model-comparison.html → window.runComparison()
전신: /dev/model-comparison.html?crop=full
검증용 페이지에서만 설정을 바꾸며 앱 기본 카메라/설정 파일은 수정하지 않습니다.
