import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from '@/lib/domain/csv';

describe('parseCsv', () => {
  it('maneja comillas, comas internas y CRLF', () => {
    expect(parseCsv('a,b\r\n"x, y","he said ""hi"""\r\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'he said "hi"'],
    ]);
  });
  it('detecta punto y coma (Excel es-AR) y quita BOM', () => {
    expect(parseCsv('﻿nombre;telefono\nAna;123')).toEqual([
      ['nombre', 'telefono'],
      ['Ana', '123'],
    ]);
  });
  it('archivo vacío no rompe', () => {
    expect(parseCsv('')).toEqual([]);
  });
});

describe('toCsv', () => {
  it('escapa comillas y neutraliza fórmulas', () => {
    expect(toCsv([['=SUM(A1)', 'a"b']])).toBe('﻿"\'=SUM(A1)","a""b"');
  });
});
