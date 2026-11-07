import type { MarginsCore } from '../marginsClient';
import type { PostView } from '../public/api';
import { openTargetFor } from '../public/openPost';
import type { MarginsStore } from '../store';
import { BOX_STRIDE } from './engine';
import { ghostGlyph } from './ghost';
import type { Scene } from './types';

export type Display = 'quote' | 'shape' | 'art';
export type Material = { kind: 'owner' | 'quote'; cells: string[] } | { kind: 'ghost' };
export interface Unit {
  w: number;
  h: number;
  asc: number;
}

export const unitsOf = (scene: Scene): Unit[] => {
  if (!scene.glyphs)
    return scene.lines.flatMap((l) => l.boxes.map(([, w, h]) => ({ w, h, asc: l.base - l.y })));
  return scene.glyphs.map(([line, box, , w]) => {
    const l = scene.lines[line]!;
    return { w, h: l.boxes[box]![2], asc: l.base - l.y };
  });
};

export const passageUnits = (scene: Scene): [number, number] => {
  const [from, to] = scene.passage.boxes;
  if (!scene.glyphs) return [from, to];
  const firstWord: number[] = [];
  let words = 0;
  for (const l of scene.lines) {
    firstWord.push(words);
    words += l.boxes.length;
  }
  const inPassage = scene.glyphs.map(([line, box]) => {
    const word = firstWord[line]! + box;
    return word >= from && word < to;
  });
  const first = inPassage.indexOf(true);
  return first < 0 ? [0, 0] : [first, inPassage.lastIndexOf(true) + 1];
};

const cellsOf = (text: string, glyphs: boolean) =>
  glyphs ? [...text].filter((c) => !/\s/u.test(c)) : text.split(/\s+/u).filter(Boolean);

export const chooseMaterial = (a: {
  scene: Scene;
  display: Display;
  quote: string | null;
  owner: string | null;
}): Material => {
  const [from, to] = passageUnits(a.scene);
  const cellsFor = (text: string | null) => {
    const cells = text === null ? null : cellsOf(text, !!a.scene.glyphs);
    return cells && cells.length === to - from ? cells : null;
  };
  const owner = cellsFor(a.owner);
  if (owner) return { kind: 'owner', cells: owner };
  const quote = a.display === 'quote' ? cellsFor(a.quote) : null;
  return quote ? { kind: 'quote', cells: quote } : { kind: 'ghost' };
};

export const ownerPassage = async (a: {
  post: PostView;
  store: MarginsStore;
  core: MarginsCore;
  libraryHashes: string[];
}): Promise<string | null> => {
  const target = await openTargetFor(a.post, a.store, a.libraryHashes);
  if (target.kind !== 'library') return null;
  const sections = await a.store.getTextMap(target.bookHash);
  if (!sections) return null;
  await a.core.loadBook(target.bookHash, sections);
  const lengths = await a.core.sectionLengths(target.bookHash, sections.length);
  if (lengths[a.post.section] !== a.post.sectionLen) return null;
  const { text } = await a.core.canonicalSection(target.bookHash, a.post.section);
  return [...text].slice(a.post.start, a.post.end).join('');
};

export const drawUnits = (
  g: CanvasRenderingContext2D,
  a: {
    boxes: Float32Array;
    units: Unit[];
    material: Material;
    passage: [number, number];
    seed: number;
    em: number;
    color: string;
    font: string;
  },
): void => {
  const { boxes, em } = a;
  const cells = a.material.kind === 'ghost' ? null : a.material.cells;
  g.fillStyle = a.color;
  g.font = `${em}px ${a.font}`;
  a.units.forEach((u, i) => {
    const o = i * BOX_STRIDE;
    if ((boxes[o + 4]! & 1) === 0) return;
    const w = u.w * em;
    g.save();
    g.translate(boxes[o]! * em + w / 2, boxes[o + 1]! * em);
    g.rotate(boxes[o + 3]!);
    g.scale(boxes[o + 2]!, 1);
    g.translate(-w / 2, 0);
    const cell = cells && i >= a.passage[0] && i < a.passage[1] ? cells[i - a.passage[0]] : null;
    if (cell) {
      g.scale(Math.min(1, w / g.measureText(cell).width), 1);
      g.fillText(cell, 0, 0);
    } else {
      g.beginPath();
      for (const [x, y, rw, rh] of ghostGlyph(a.seed, i, u.w, u.h))
        g.roundRect(x * em, (y - u.asc) * em, rw * em, rh * em, (Math.min(rw, rh) * em) / 2);
      g.fill();
    }
    g.restore();
  });
};
