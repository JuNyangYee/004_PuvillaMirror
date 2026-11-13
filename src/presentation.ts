import type {Config} from './config';

export const PORTRAIT_ASPECT = 9 / 16;
/** Fit the entire portrait stage, preserving black bars outside it. */
export function portraitViewport(width:number,height:number){
  const w=Math.max(0,Math.min(width,height*PORTRAIT_ASPECT));
  return {width:w,height:w/PORTRAIT_ASPECT};
}
/** Apply after saved preferences so old layout/model choices cannot override the installation. */
export function enforcePresentation(cfg:Config):Config{
  cfg.scene.layout='portrait';cfg.scene.aspect=PORTRAIT_ASPECT;
  cfg.character.model='puuvilla';cfg.character.modelPath='./models/pu_v4.obj';
  cfg.outfit.muffler.fittedPath='./models/pu_muffler_v4.bin';
  cfg.outfit.style='christmas';cfg.outfit.sitBody=false;cfg.outfit.seatBody=false;
  cfg.filter.enabled=false;
  return cfg;
}
