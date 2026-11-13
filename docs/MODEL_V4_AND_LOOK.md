# v4 모델과 겨울 마을 룩

2026-11-13 반영. `Puvilla_rig_muffler_v4.blend`에서 몸체·눈·코와 목도리를 추출하고, 기존 마을 구도를 유지하면서 가이드에 맞춰 배경 색감과 조명을 수정했습니다.

## 모델 위치와 호환성

| 파일 | 역할 |
| --- | --- |
| `public/models/pu_v4.obj` | 몸체, 양쪽 눈, 코의 subdivision cage |
| `public/models/pu_muffler_v4.bin` | v4 목도리 형상, 줄무늬 색, 스킨 가중치 |
| `public/models/pu_v4.source.json` | 원본 해시, 추출 정보, 본 대응표 |
| `scripts/export-puvilla-v4.py` | Blender에서 웹용 모델을 재추출하는 스크립트 |

원본: `D:\2026-09_ShinsegaeChristmas\005_3D-Works\003_PuvillaRig\Puvilla_rig_muffler_v4.blend`. 원본 파일은 수정하지 않았습니다.

기존 모델과 좌표축·정점 순서·면 방향을 맞춰 비교하면 몸체·눈·코의 토폴로지가 같습니다. 최대 좌표 차이는 0.000051 cm 미만으로 기존 추적 리그를 유지할 수 있습니다. 목도리는 94,888 정점, 189,832 삼각형이며, 원본 가중치를 앱의 8개 본에 대응시킵니다. 목도리는 실행 시 별도 바이너리를 자동 로드하므로 사용자가 수동으로 업로드할 필요는 없습니다. 배포에는 OBJ와 목도리 BIN이 모두 필요합니다.

Blender의 IK 컨트롤과 실시간 보정 모디파이어를 브라우저에서 실행하지는 않습니다. Shrinkwrap은 rest pose에서 구워 넣으며, 움직임은 기존 웹캠 추적 리그가 구동합니다.

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' -b 'D:\2026-09_ShinsegaeChristmas\005_3D-Works\003_PuvillaRig\Puvilla_rig_muffler_v4.blend' --python scripts/export-puvilla-v4.py
node --experimental-transform-types scripts/check-v4-model.mjs
```

## 색감과 배경

- 기준: `009_Sequence/docs/guides/LOOK_AND_TONE.md`, `references/look_tone/톤_기준판.jpg`, 사용자가 첨부한 `눈내리기_눈내림_눈송이없음.png` 이미지.
- 최종 배경: `public/bg/winter-village-color-warm.png`. 기존 마을 구도를 유지한 색감 수정본으로, 청보라색 눈·하늘과 따뜻한 창문 불빛을 적용합니다.
- 기본 시점과 시점 초기화는 원래 값으로 복원했습니다: `pViewHeightCm=250`, `pViewCenterCm=95`, `pViewOffsetXcm=0`, `cameraTiltDeg=-6`, `cameraYawDeg=0`.
- 목도리: 짙은 빨강 `#982c43`, 크림 `#e2c7ba`. 기존 줄무늬의 위치와 형상을 유지하며 정점 색을 변경합니다.
- 조명: 차가운 청보라색 주변광과 따뜻한 가장자리 빛을 조합하고, 배경 흐림을 낮춰 집의 형태와 불빛이 보이도록 조정했습니다.
- 배경 원본은 내장 ImageGen 결과 `exec-7c2bf579-fdf9-4632-94e2-c8c943257a25.png`입니다.

## 확인 화면과 범위

[복원한 색감 수정 배경](../public/bg/winter-village-color-warm.png) · [교체 전 팔 동작 검증](model-v4/raised-arms.png)

시뮬레이터에서 목도리 로드, 양팔 올리기, 고개 회전, 웃음·입 벌림, 측면 렌더링을 확인했습니다. 실제 웹캠 참여자 테스트는 별도입니다. 배경은 기존 2D 투영 방식이므로 큰 측면 시점에서는 늘어짐이 생깁니다. 기본 정면 전시 구도를 기준으로 사용합니다.
