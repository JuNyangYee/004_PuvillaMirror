import type {Config} from './config';

/** Hybrid keeps most of the old stabilization while admitting measured motion. */
export function hybridFollowAmount(body:Config['body']):number {
 const amount=body.armHybridFollow??.35;
 return Number.isFinite(amount)?Math.max(0,Math.min(1,amount)):.35;
}

/** Pin production to original retargeting: resting shoulder overlap is intentional.
 * Apply after saved preferences so old hybrid settings cannot reactivate it. */
export function enforceLegacyArmTracking(cfg:Config):Config {
 cfg.body.armTrackingMode="legacy";
 return cfg;
}
