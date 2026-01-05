import * as idb from './idb.js';

let stream = null, recorder = null, chunks = [], lastBlob = null;

export async function startRecording(constraints) {
  stream = await navigator.mediaDevices.getUserMedia(constraints);
  chunks = [];
  recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (ev)=> { if (ev.data && ev.data.size) chunks.push(ev.data); };
  recorder.onstop = ()=> { lastBlob = new Blob(chunks, { type: chunks[0]?.type || 'audio/webm' }); };
  recorder.start();
}

export function stopRecording() {
  if (recorder && recorder.state === 'recording') recorder.stop();
  if (stream) stream.getTracks().forEach(t=>t.stop());
  stream = null;
}

export function getLastRecording() { return lastBlob; }

export async function saveRecordingToIDB(blob, name){
  const key = await idb.putMedia({ blob, name, type: blob.type });
  return key;
}