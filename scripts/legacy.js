// Used only by migration and regression checks. Never sent to the browser/server.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const oldRoot = path.resolve(root, '../routeplanner_old');
export const systems = {
  ftmc: ['ft_mcsubway.js', 'config.ftmc.json'],
  ftmc_preview: ['preview/ft_mcsubway.js', 'preview/config.ftmc.json'],
  trtc: ['trtc_routes.js', 'config.trtc.json'],
  newisle: ['newisle_mcsubway.js', 'config.newisle.json'],
};
export function loadLegacy(id) {
  const context = { console: { log() {}, info() {}, warn() {} }, JS_VARNAME_LANG_SUFFIX: '', CONFIG: {} };
  context.window = context;
  context.document = { getElementById: () => null };
  vm.createContext(context);
  for (const file of ['utils.js', 'mapGUI.js', 'subwaycal.js.php', systems[id][0]]) {
    let source = fs.readFileSync(path.join(oldRoot, file), 'utf8');
    source = source.replace(/var CONFIG = <\?=\$CONFIG_RAW\?>;/g, 'var CONFIG = {};').replace(/<\?php[\s\S]*?\?>/g, '');
    vm.runInContext(source, context, { filename: file, timeout: 15000 });
  }
  return context;
}
