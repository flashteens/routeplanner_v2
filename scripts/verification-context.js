import fs from 'node:fs';

// V2 is public and self-contained. V1 audits are optional unless explicitly requested.
/**
 * @param {{directory:string, explicit?:boolean, skip?:boolean, required?:boolean}} options
 * @returns {{enabled:true}|{enabled:false, reason:string}}
 */
export function legacyAuditMode({directory,explicit=false,skip=false,required=false}){
  if(skip&&required)throw new Error('Choose either --skip-legacy or --require-legacy, not both.');
  if(skip)return {enabled:false,reason:'explicit --skip-legacy; no V1 audit or parity is claimed'};
  let available=false;
  try{available=fs.statSync(directory).isDirectory();}catch(error){if(error.code!=='ENOENT')throw error;}
  if(available)return {enabled:true};
  if(explicit||required)throw new Error(`V1 source directory is unavailable: ${directory}. Correct LEGACY_ROOT, or use --skip-legacy for V2-only verification.`);
  return {enabled:false,reason:'optional V1 checkout is absent; no V1 audit or parity is claimed'};
}
