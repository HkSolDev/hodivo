import type { Format } from './prepare';

export type ExamId = 'ssc' | 'rrb' | 'upsc' | 'ibps' | 'neet' | 'jee';

export type ExamTemplate = {
  id: string;
  label: string;
  format: Format;
  maxKB: number;
  minKB?: number;
  width?: number;
  height?: number;
  note?: string;
};

export type ExamGroup = {
  id: ExamId;
  label: string;
  templates: readonly ExamTemplate[];
};

export const EXAM_GROUPS: readonly ExamGroup[] = [
  {
    id: 'ssc',
    label: 'SSC',
    templates: [
      {
        id: 'ssc-photo',
        label: 'Photo',
        format: 'jpg',
        maxKB: 50,
        minKB: 20,
        width: 350,
        height: 450,
      },
      {
        id: 'ssc-sign',
        label: 'Signature',
        format: 'jpg',
        maxKB: 20,
        minKB: 10,
        width: 140,
        height: 60,
      },
    ],
  },
  {
    id: 'rrb',
    label: 'Railway (RRB)',
    templates: [
      {
        id: 'rrb-photo',
        label: 'Photo',
        format: 'jpg',
        maxKB: 70,
        minKB: 30,
        width: 350,
        height: 450,
        note: '3.5 × 4.5 cm (some CENs use live webcam capture)',
      },
      {
        id: 'rrb-sign',
        label: 'Signature',
        format: 'jpg',
        maxKB: 70,
        minKB: 30,
        width: 140,
        height: 60,
        note: 'Black ink on white paper (some CENs cap at 49 KB)',
      },
      {
        id: 'rrb-cert',
        label: 'Certificate PDF',
        format: 'pdf',
        maxKB: 500,
        note: 'SC/ST travel pass or supporting certificate',
      },
    ],
  },
  {
    id: 'upsc',
    label: 'UPSC',
    templates: [
      {
        id: 'upsc-photo',
        label: 'Photo',
        format: 'jpg',
        maxKB: 200,
        minKB: 20,
        width: 350,
        height: 350,
      },
    ],
  },
  {
    id: 'ibps',
    label: 'IBPS',
    templates: [
      {
        id: 'ibps-photo',
        label: 'Photo',
        format: 'jpg',
        maxKB: 50,
        minKB: 20,
        width: 200,
        height: 230,
      },
      {
        id: 'ibps-sign',
        label: 'Signature',
        format: 'jpg',
        maxKB: 20,
        minKB: 10,
        width: 140,
        height: 60,
      },
      {
        id: 'ibps-thumb',
        label: 'Thumb',
        format: 'jpg',
        maxKB: 50,
        minKB: 20,
        width: 240,
        height: 240,
      },
    ],
  },
  {
    id: 'neet',
    label: 'NEET UG',
    templates: [
      {
        id: 'neet-photo',
        label: 'Passport Photo',
        format: 'jpg',
        maxKB: 200,
        minKB: 10,
        width: 275,
        height: 354,
        note: 'White background, 80% face visible',
      },
      {
        id: 'neet-postcard',
        label: 'Postcard Photo (4×6)',
        format: 'jpg',
        maxKB: 200,
        minKB: 10,
        width: 400,
        height: 600,
        note: '4 × 6 inch white background',
      },
      {
        id: 'neet-sign',
        label: 'Signature',
        format: 'jpg',
        maxKB: 30,
        minKB: 4,
        width: 275,
        height: 118,
        note: 'Black ink on white paper, running hand',
      },
      {
        id: 'neet-thumb',
        label: 'Thumb Impression',
        format: 'jpg',
        maxKB: 200,
        minKB: 10,
      },
      {
        id: 'neet-cert',
        label: 'Certificate PDF',
        format: 'pdf',
        maxKB: 300,
        minKB: 50,
        note: 'Category / PwBD / citizenship proof',
      },
    ],
  },
  {
    id: 'jee',
    label: 'JEE Main',
    templates: [
      {
        id: 'jee-photo',
        label: 'Photo',
        format: 'jpg',
        maxKB: 200,
        minKB: 10,
        width: 275,
        height: 354,
        note: '3.5 × 4.5 cm, white background',
      },
      {
        id: 'jee-sign',
        label: 'Signature',
        format: 'jpg',
        maxKB: 100,
        minKB: 10,
        width: 275,
        height: 118,
        note: '3.5 × 1.5 cm, black or blue ink',
      },
      {
        id: 'jee-cert',
        label: 'Certificate PDF',
        format: 'pdf',
        maxKB: 300,
        minKB: 50,
        note: 'Category / PwD / Class 10 certificate',
      },
    ],
  },
] as const;

/** Formats an exam template's constraints as a concise summary string. */
export function formatTemplateSpec(tpl: ExamTemplate) {
  const size = tpl.minKB
    ? `${tpl.minKB}–${tpl.maxKB} KB`
    : `up to ${tpl.maxKB} KB`;
  const dims =
    tpl.width && tpl.height ? `${tpl.width}×${tpl.height} px · ` : '';
  return `${tpl.format.toUpperCase()} · ${dims}${size}`;
}
