export function packFilesToTar(files){
  const encoder = new TextEncoder();
  const blocks = [];
  function pad(str, length){ let s = encoder.encode(str); const out = new Uint8Array(length); out.set(s.slice(0,Math.min(s.length,length))); return out; }
  function octal(number, length){ const s = number.toString(8).padStart(length-1,'0') + '\0'; return pad(s, length); }
  files.forEach(f=>{
    const name = f.name;
    const dataU8 = (typeof f.data === 'string') ? encoder.encode(f.data) : f.data;
    const size = dataU8.length;
    const header = new Uint8Array(512);
    header.set(pad(name,100),0);
    header.set(octal(0,8),100);
    header.set(octal(0,8),108);
    header.set(octal(0,8),116);
    header.set(octal(size,12),124);
    header.set(octal(Math.floor(Date.now()/1000),12),136);
    header.set(encoder.encode('        '),148);
    header.set(encoder.encode('0'),156);
    header.set(pad('',100),157);
    header.set(encoder.encode('ustar\0'),257);
    header.set(encoder.encode('00'),263);
    header.set(pad('',32),265);
    header.set(pad('',32),297);
    let sum = 0; for (let i=0;i<512;i++) sum += header[i];
    const ch = octal(sum,8);
    header.set(ch,148);
    blocks.push(header);
    blocks.push(dataU8);
    const padSize = (512 - (size % 512)) % 512;
    if (padSize) blocks.push(new Uint8Array(padSize));
  });
  blocks.push(new Uint8Array(512));
  blocks.push(new Uint8Array(512));
  return new Blob(blocks, {type:'application/x-tar'});
}

export async function parseTar(blob){
  const ab = await blob.arrayBuffer();
  const u8 = new Uint8Array(ab);
  const files = [];
  let offset = 0;
  while (offset + 512 <= u8.length) {
    const header = u8.subarray(offset, offset+512);
    const allZero = header.every(b=>b===0);
    if (allZero) break;
    const name = new TextDecoder().decode(header.subarray(0,100)).replace(/\0.*$/,'');
    const sizeOct = new TextDecoder().decode(header.subarray(124,136)).replace(/\0.*$/,'').trim();
    const size = parseInt(sizeOct,8) || 0;
    offset += 512;
    const data = u8.subarray(offset, offset + size);
    files.push({ name, data: data.slice() });
    const sizePadded = Math.ceil(size/512)*512;
    offset += sizePadded;
  }
  return files;
}