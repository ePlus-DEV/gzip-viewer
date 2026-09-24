// Chrome usually decodes Content-Encoding automatically. A raw .gz file
// (often served as application/octet-stream) still needs manual decompression.
export async function responseText(response: Response): Promise<string> {
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
