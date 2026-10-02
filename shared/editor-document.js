import {emptyHistory} from './editor-history.js';
// An omitted empty history and an exported empty history are the same document.
export const editorSnapshot=data=>JSON.stringify({...data,editorHistory:data.editorHistory??emptyHistory()});
