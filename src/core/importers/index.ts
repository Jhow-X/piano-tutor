/** Despacho por extensão, com sniff de conteúdo como desempate. */

import type { Score } from '../score';
import { importMidi } from './midi';
import { importEngraved } from './engraved';
import { importAbc, looksLikeAbc } from './abc';

export class UnsupportedFormatError extends Error {}

export const ACCEPTED_EXTENSIONS = '.mid,.midi,.musicxml,.mxl,.xml,.krn,.abc';

export async function importFile(file: File): Promise<Score> {
  const name = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();
  const title = stripExtension(file.name);

  if (name.endsWith('.mid') || name.endsWith('.midi') || looksLikeMidi(buffer)) {
    return importMidi(buffer, { title });
  }
  if (name.endsWith('.mxl') || looksLikeZip(buffer)) {
    return importEngraved(buffer, name, title);
  }
  if (name.endsWith('.musicxml') || name.endsWith('.xml') || name.endsWith('.krn')) {
    return importEngraved(buffer, name, title);
  }
  if (name.endsWith('.abc')) {
    return importAbc(new TextDecoder().decode(buffer), title);
  }

  // Sem extensão reconhecível, decide-se pelo conteúdo.
  const text = new TextDecoder().decode(buffer.slice(0, 4096));
  if (looksLikeMusicXml(text) || looksLikeKern(text)) return importEngraved(buffer, name, title);
  if (looksLikeAbc(text)) return importAbc(new TextDecoder().decode(buffer), title);

  throw new UnsupportedFormatError(
    `Formato não reconhecido: ${file.name}. Aceitos: .mid, .musicxml, .mxl, .krn, .abc`,
  );
}

/** Todo SMF começa com o chunk "MThd". */
function looksLikeMidi(buffer: ArrayBuffer): boolean {
  return startsWith(buffer, [0x4d, 0x54, 0x68, 0x64]);
}

/** `.mxl` é um zip; o Verovio sabe abri-lo direto. */
function looksLikeZip(buffer: ArrayBuffer): boolean {
  return startsWith(buffer, [0x50, 0x4b, 0x03, 0x04]);
}

function looksLikeMusicXml(text: string): boolean {
  return /<score-partwise|<score-timewise|<!DOCTYPE score-/.test(text);
}

/** Todo arquivo Humdrum declara os seus spines com `**kern` / `**mens` etc. */
function looksLikeKern(text: string): boolean {
  return /^\*\*kern\b/m.test(text) || /^!!!(COM|OTL|filter)/m.test(text);
}

function startsWith(buffer: ArrayBuffer, signature: number[]): boolean {
  if (buffer.byteLength < signature.length) return false;
  const head = new Uint8Array(buffer, 0, signature.length);
  return signature.every((byte, index) => head[index] === byte);
}

export function stripExtension(name: string): string {
  return name.replace(/\.[^./\\]+$/, '');
}
