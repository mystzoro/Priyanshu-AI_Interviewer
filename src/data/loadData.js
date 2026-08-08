import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

export const curriculum = JSON.parse(readFileSync(path.join(DATA_DIR, 'curriculum.json'), 'utf-8'));
const candidatesFile = JSON.parse(readFileSync(path.join(DATA_DIR, 'candidates.json'), 'utf-8'));
export const candidates = candidatesFile.candidates;

export const dayIndex = new Map(curriculum.days.map((d) => [d.day, d]));

export function moduleForDay(day) {
  return curriculum.modules.find((m) => day >= m.days[0] && day <= m.days[1]) || null;
}

export function findCandidateById(id) {
  return candidates.find((c) => c.member.id === id) || null;
}
