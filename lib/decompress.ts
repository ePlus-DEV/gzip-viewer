// Streaming helpers keep large GZIP/JSONL resources off the main memory hot path.
function decodedStream(response:Response):ReadableStream<Uint8Array>{
  if(!response.body) throw new Error('Response body is unavailable.');
  const encoding=(response.headers.get('content-encoding')||'').toLowerCase();
  const path=(()=>{try{return new URL(response.url).pathname;}catch{return '';}})();
  // Browsers normally remove Content-Encoding before exposing the body. For raw
  // .gz resources, pipe through DecompressionStream when the server did not.
  if(/gzip/.test(encoding)) return response.body;
  if(/\.gz$/i.test(path)){
    if(typeof DecompressionStream==='undefined') throw new Error('This browser cannot decompress GZIP; please update Chrome.');
    return response.body.pipeThrough(new DecompressionStream('gzip'));
  }
  return response.body;
}

export async function responseText(response: Response): Promise<string> {
  // Keep this compatibility path for JSON/XML resources that need whole-document parsing.
  // JSONL product feeds should use streamTextLines instead.
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const rawGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!rawGzip) return new TextDecoder().decode(bytes);
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser cannot decompress GZIP; please update Chrome.');
  }
  return new Response(
    new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip')),
  ).text();
}

export async function streamTextLines(
  response:Response,
  onLine:(line:string,lineNumber:number)=>void|Promise<void>,
):Promise<number>{
  const reader=decodedStream(response).getReader();
  const decoder=new TextDecoder();
  let pending='',lineNumber=0;
  try{
    while(true){
      const {value,done}=await reader.read();
      if(done)break;
      pending+=decoder.decode(value,{stream:true});
      let newline:number;
      while((newline=pending.indexOf('\n'))>=0){
        let line=pending.slice(0,newline);
        pending=pending.slice(newline+1);
        if(line.endsWith('\r'))line=line.slice(0,-1);
        lineNumber++;
        await onLine(line,lineNumber);
        if(lineNumber%1000===0) await new Promise<void>(resolve=>setTimeout(resolve,0));
      }
    }
    pending+=decoder.decode();
    if(pending){
      lineNumber++;
      await onLine(pending.endsWith('\r')?pending.slice(0,-1):pending,lineNumber);
    }
    return lineNumber;
  }finally{
    reader.releaseLock();
  }
}
