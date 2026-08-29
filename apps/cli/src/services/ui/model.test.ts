import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createModelRunner } from './model.ts';

let cache: string;

const MODEL_DIR = 'Xenova/multilingual-e5-base';

const put = (relative: string, bytes: number) => {
  const path = join(cache, MODEL_DIR, relative);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, Buffer.alloc(bytes));
};

beforeEach(() => {
  cache = mkdtempSync(join(tmpdir(), 'memex-model-'));
});

afterEach(() => {
  rmSync(cache, { recursive: true, force: true });
});

describe('the model runner', () => {
  it('says nothing is there when nothing is there', () => {
    expect(createModelRunner(cache).read()).toEqual({ kind: 'absent' });
  });

  it('reads the weights off disk rather than a marker someone had to write', () => {
    put('tokenizer.json', 16);
    put('onnx/model_quantized.onnx', 279_000_000);

    expect(createModelRunner(cache).read()).toEqual({ kind: 'ready' });
  });

  it('treats a download killed halfway as not ready, because it is not', () => {
    put('tokenizer.json', 16);
    put('onnx/model_quantized.onnx', 120_000_000);

    expect(createModelRunner(cache).read()).toEqual({ kind: 'absent' });
  });

  it('needs the tokenizer too, not only the weights', () => {
    put('onnx/model_quantized.onnx', 279_000_000);

    expect(createModelRunner(cache).read()).toEqual({ kind: 'absent' });
  });

  it('does not start a second download when the weights are already here', () => {
    put('tokenizer.json', 16);
    put('onnx/model_quantized.onnx', 279_000_000);
    const runner = createModelRunner(cache);

    expect(runner.start()).toEqual({ kind: 'ready' });
  });
});

describe('a download in flight', () => {
  it('keeps saying downloading even once the file on disk looks big enough', () => {
    const runner = createModelRunner(cache);
    runner.start();
    // the weights land under the final name while the download is still running
    put('tokenizer.json', 16);
    put('onnx/model_quantized.onnx', 279_000_000);

    expect(runner.read().kind).toBe('downloading');
  });
});
