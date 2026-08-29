import { describe, expect, it } from 'vitest';
import { yamlScalar } from './yaml.ts';

describe('yamlScalar', () => {
  it('unescapes the quotes inside a double-quoted scalar', () => {
    expect(yamlScalar('"1인칭은 \\"필자\\""')).toBe('1인칭은 "필자"');
  });

  it('leaves an unquoted scalar exactly as written', () => {
    expect(yamlScalar('공백을 찾아내는 \\s 캐릭터 클래스')).toBe(
      '공백을 찾아내는 \\s 캐릭터 클래스',
    );
  });

  it('keeps a backslash that a double-quoted scalar really escaped', () => {
    expect(yamlScalar('"a \\\\ b"')).toBe('a \\ b');
  });

  it('leaves an escape it does not know rather than eating the backslash', () => {
    expect(yamlScalar('"\\s"')).toBe('\\s');
  });

  it('reads the escapes that stand for whitespace', () => {
    expect(yamlScalar('"a\\nb"')).toBe('a\nb');
    expect(yamlScalar('"a\\tb"')).toBe('a\tb');
  });

  it('doubles down on quotes the single-quoted way', () => {
    expect(yamlScalar("'it''s here'")).toBe("it's here");
    expect(yamlScalar("'\\s stays'")).toBe('\\s stays');
  });

  it('trims the line before deciding what it is', () => {
    expect(yamlScalar('  "quoted"  ')).toBe('quoted');
  });

  it('leaves a lone quote alone rather than reading it as a pair', () => {
    expect(yamlScalar('"')).toBe('"');
    expect(yamlScalar('')).toBe('');
  });
});
