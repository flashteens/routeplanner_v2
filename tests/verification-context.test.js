import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {legacyAuditMode} from '../scripts/verification-context.js';
const available=fileURLToPath(new URL('../',import.meta.url));
const missing=fileURLToPath(new URL('../node_modules/.missing-v1-'+process.pid+'/',import.meta.url));
test('Public V2 verification skips only the unavailable optional V1 audit',()=>{
  const result=legacyAuditMode({directory:missing});assert.equal(result.enabled,false);assert.match(result.reason,/optional V1 checkout is absent/);assert.match(result.reason,/no V1 audit or parity/);
});
test('Available V1 directories retain the legacy audit',()=>assert.deepEqual(legacyAuditMode({directory:available}),{enabled:true}));
test('Explicit or required unavailable V1 is an actionable failure, not an automatic skip',()=>{
  for(const options of [{explicit:true},{required:true}])assert.throws(()=>legacyAuditMode({directory:missing,...options}),/V1 source directory is unavailable/);
});
test('Explicit V2-only mode skips V1 even if installed, but conflicting modes fail',()=>{
  assert.equal(legacyAuditMode({directory:available,skip:true}).enabled,false);assert.equal(legacyAuditMode({directory:missing,explicit:true,skip:true}).enabled,false);assert.throws(()=>legacyAuditMode({directory:available,skip:true,required:true}),/not both/);
});
