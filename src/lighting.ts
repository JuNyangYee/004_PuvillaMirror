export type LightRole = 'key' | 'fill' | 'rim';
export interface LightDirection { azimuth: number; elevation: number }
export type LightDirections = Record<LightRole, LightDirection>;

/** Front is 0°, right is +90°, back is ±180°. Positions stay fixed in the scene when orbiting. */
export const DEFAULT_LIGHT_DIRECTIONS: LightDirections = {
  key: { azimuth: -35, elevation: 30 },
  fill: { azimuth: 50, elevation: 55 },
  rim: { azimuth: 145, elevation: 35 },
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
  for (const role of ['key', 'fill', 'rim'] as const) {
    Object.assign(directions[role], DEFAULT_LIGHT_DIRECTIONS[role]);
  }
}
