# Arm tracking modes

The default is `body.armTrackingMode: "hybrid"`. Its `armHybridFollow` value defaults to 0.35: direction retargeting retains 65% of the original rest/elevation and elbow-plane correction, while admitting 35% of the measured direction. Camera-plane depth reconstruction is also blended back toward the world estimate by this amount. This is a per-stage direction blend, not a blend of two complete rendered characters.

Hybrid keeps legacy confidence/drift guards, palm/wrist stabilization, One Euro and render interpolation. It always applies the new torso projection AFTER interpolation, even if an old saved config disables `armTorsoClearance`. The old lift-preserving torso solver is bypassed. The UI locks the contact toggle on in hybrid mode; direct mode still permits unprotected comparisons.


The comparison mode `body.armTrackingMode: "direct"` follows MediaPipe world shoulder/elbow/wrist directions in the rendered chest frame. It bypasses image-plane depth reconstruction, the A-pose elevation floor, lift/azimuth limits, elbow gain and elbow-plane stabilization. Valid tracked motion no longer has to stay near the previous confident anchor. Finger world landmarks drive palm/wrist orientation without the old camera-facing bias, wrist-angle cap, raised-arm weighting or twist speed cap.

Confidence, finite/physical landmark validation, off-screen rejection, 180 ms acquisition, missing-person release, One Euro filtering and render interpolation remain. This is directional retargeting to the character's existing proportions, not positional matching of a human skeleton.

## Controls and rollback

D > 상반신 — 몸통·팔 따라하기:
- 팔 동작 방식: 혼합 — 안정화 + 동작 추종 / MediaPipe 직접 따라가기 / 기존 제한 방식 (복원).
- 혼합 추종량: 0 retains old directional correction, 1 follows measured directions; palm stabilization and collision remain in hybrid.
- 몸통 관통 방지: off gives uncorrected directional following, on projects the displayed arms outside a torso proxy.
- 기존 팔 제한 설정 appears only in legacy mode.

All original constraint modules and config values are preserved. Select `legacy` to reactivate them. Filter/contact history is cleared on mode changes; acquisition restarts without reloading the camera.
The original body settings are in `dev/backups/arms-before-direct.json` (base commit `bc170a8`); local backup branch `backup/arms-before-direct` points to the entire pre-change project.

## Contact projection

`directArmContact.ts` runs AFTER the arm quaternion interpolation. It samples the upper arm, elbow, forearm and paw along the same RoundedElbowFrame curve and bend-spread setting as the cage. A source-scale torso ellipsoid is expanded by a different limb radius at each sample. The blended shoulder attachment is excluded.

Only colliding poses are changed. A bounded local projection can move both upper and forearm directions; it does not preserve the old elevation constraint. If a folded pose gets stuck, a bounded search chooses the smallest directional change among feasible outward exit paths. Free motion is unchanged. No new inference or render loop is added.

This is approximate body self-collision, not mesh-perfect collision: head, muffler, finger/paw details and arm-to-arm contact are not modeled. Extreme input or strong torso rotations still need visual review.

## Validation

`npm run arm:direct:check`: production mirror-left rig, 560 static poses, rotated chest frames, exact free-direction mapping, raw world-landmark input in both mirror modes, production solveArm bypass, and post-interpolation belly sweeps at 15/30/60 Hz.
`npm run rig:check` retains the legacy constraint tests; legacy-only image/depth/drift tests explicitly select legacy mode.
`scripts/check-render-preparation.mjs` checks actual cage positions/normals under immediate vs deferred rendering.

`npm run arm:hybrid:check`: verifies direction blend endpoints, improved tracking of lowered arms, partial depth reconstruction, and 480 production-character frames with mandatory post-interpolation contact even when saved legacy flags disable it.
