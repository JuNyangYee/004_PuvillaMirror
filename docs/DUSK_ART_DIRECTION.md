# Balanced winter dusk

Generated with the built-in image generation tool (lighting-weather edit).

Asset: `public/bg/winter-village-square-dusk.png`

Retain the village square composition; reduce the sunset pink cast without replacing the warm evening atmosphere with a cold blue night. Moderate darkness, muted blue-violet shadows, soft amber windows and cream highlights. Oil filter settings remain unchanged.

Lighting: exposure 1; key 1.95; fill 1.3; rim 2.4; bounce 0.3; hemisphere 0.9; environment 0.07. Colors are stored in src/lighting.ts and public/config.json.

## Final prompt

Use case: lighting-weather. Edit image 1 (empty village square) ONLY in color and light. Image 2 (painted village with animals) is a reference ONLY for moderate dusk darkness and warm/cool balance; do NOT copy its composition, animals, wall or brush strokes. Preserve image 1 exact buildings, clock bell tower, framing, textures and empty snowy foreground. This is a subtle restrained correction of image 1, not a new blue-night scene. Darken the overall environment modestly, reduce the pervasive pink-magenta cast by about half. Keep muted indigo-blue violet shadows, warm amber windows, tiny golden Christmas lights and some subtle creamy gold reflected light on snow. Upper sky remains dusky indigo, distant horizon retains a subdued golden orange glow with a few muted warm clouds, NOT vivid pink. Snow remains a balanced blue-grey with a slight violet undertone and localized soft warm cream highlights, not flat icy cyan, and not pink across the entire ground. Match image 2's cozy dusk balance: moderately dark, moderately warm. Preserve richness and depth, no washed out whites, no intense saturated orange or blue. Fine detailed rendered source suitable for a separately applied oil paint shader, NO added painterly brush texture. NO animals, people, lettering, foreground walls or new objects. Portrait same framing and composition as image 1.

## Brighter reference match

Current asset: `public/bg/winter-village-square-dusk-bright.png`. Built-in image generation edit, using the previous dusk image as composition and the user image as the brightness/color reference. Lifted snow and building midtones, restored soft peach highlights and lavender-blue shadows. Character lighting and oil parameters remain unchanged.

### Final prompt

Use case: lighting-weather / color matching. Image 1 is the EDIT TARGET, an empty village square. Image 2 is the EXACT brightness and color reference. Regrade image 1 to match image 2's luminous storybook dusk palette, rather than the current overly dark desaturated night. Preserve ALL composition, buildings, bell tower, trees, camera framing and textures of image 1 exactly. Lift midtones significantly, about half a stop, particularly snow, roofs and facades. Snow shadows should be medium-light periwinkle/lavender blue like reference 2, with clear soft peach-cream highlights. Upper sky is rich indigo blue, sunset clouds a restrained warm coral orange, distant horizon golden amber. Windows and lights honey gold with warm reflected light on nearby timber and snow. Match reference 2's visible shadow detail, brightness, and warm/cool balance closely. Do not make everything pink, but DO preserve the reference's soft peach highlights and violet-blue shadows; do not neutralize all warmth or all lavender. Avoid dark slate-grey snow, dull grey-brown buildings and a blue-night treatment. Source must retain fine 3D rendered detail (the app applies oil brush strokes separately), so do not bake brush texture. No animals, people, foreground stone wall, text or new objects. Image 2 supplies ONLY light and palette, never its layout or subjects. Same portrait framing as image 1.
