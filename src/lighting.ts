export type LightRole = 'key' | 'fill' | 'rim' | 'bounce';
export interface LightDirection { azimuth: number; elevation: number }
export type LightDirections = Record<LightRole, LightDirection>;
export type WinterLightColors = Record<LightRole | 'sky' | 'ground', string>;
/** Sunset village: warm window key, lavender sky fill and a golden back-left rim. */
export const DEFAULT_WINTER_LIGHT_COLORS: WinterLightColors = {
  key: '#fff6ee', fill: '#c5cae6', rim: '#ffbd7d', bounce: '#dfcddd', sky: '#b8c2e6', ground: '#d9c4da',
};

/** Front is 0°, right is +90°, back is ±180°. Positions stay fixed in the scene when orbiting. */
export const DEFAULT_LIGHT_DIRECTIONS: LightDirections = {
  key: { azimuth: -38, elevation: 32 },
  fill: { azimuth: 55, elevation: 22 },
  rim: { azimuth: -125, elevation: 24 },
  bounce: { azimuth: 15, elevation: -32 },
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
