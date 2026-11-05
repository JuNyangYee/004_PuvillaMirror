export type LightRole = 'key' | 'fill' | 'rim' | 'bounce';
export interface LightDirection { azimuth: number; elevation: number }
export type LightDirections = Record<LightRole, LightDirection>;
export type WinterLightColors = Record<LightRole | 'sky' | 'ground', string>;
/** Cool sky and lavender snow bounce, with sunset warmth confined to the back-right edge. */
export const DEFAULT_WINTER_LIGHT_COLORS: WinterLightColors = {
  key: '#dce5ff', fill: '#eedee9', rim: '#ffd0ab', bounce: '#d8def7', sky: '#bfcef0', ground: '#e4d6eb',
};

/** Front is 0°, right is +90°, back is ±180°. Positions stay fixed in the scene when orbiting. */
export const DEFAULT_LIGHT_DIRECTIONS: LightDirections = {
  key: { azimuth: -40, elevation: 40 },
  fill: { azimuth: 55, elevation: 15 },
  rim: { azimuth: 130, elevation: 25 },
  bounce: { azimuth: -15, elevation: -35 },
};

export function lightPosition(direction: LightDirection): [number, number, number] {
  const azimuth = direction.azimuth * Math.PI / 180;
  const elevation = direction.elevation * Math.PI / 180;
  const radius = 6;
  return [
    radius * Math.cos(elevation) * Math.sin(azimuth),
    radius * Math.sin(elevation),
    radius * Math.cos(elevation) * Math.cos(azimuth),
  ];
}

export function resetLightDirections(directions: LightDirections): void {
  for (const role of ['key', 'fill', 'rim', 'bounce'] as const) {
    Object.assign(directions[role], DEFAULT_LIGHT_DIRECTIONS[role]);
  }
}
