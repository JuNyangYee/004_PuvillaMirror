import type {Config} from './config';

/** Hybrid keeps most of the old stabilization while admitting measured motion. */
export function hybridFollowAmount(body:Config['body']):number {
 const amount=body.armHybridFollow??.35;
 return Number.isFinite(amount)?Math.max(0,Math.min(1,amount)):.35;
}
