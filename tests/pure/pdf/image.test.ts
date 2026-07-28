// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { imageToJpeg } from '../../../src/pure/pdf/image';

function fakeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const ctx = {
    fillStyle: '',
    fillRect: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  canvas.getContext = vi.fn(() => ctx) as any;
  canvas.toDataURL = vi.fn(() => 'data:image/jpeg;base64,AAAA') as any;
  return canvas;
}

describe('imageToJpeg', () => {
  it('returns null for an empty src', async () => {
    const result = await imageToJpeg('', fakeCanvas);
    expect(result).toBe(null);
  });

  it('rasterizes an image to JPEG bytes with scaled dimensions', async () => {
    const OriginalImage = globalThis.Image;
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 2000;
      naturalHeight = 1000;
      set src(_v: string) { queueMicrotask(() => this.onload && this.onload()); }
    }
    (globalThis as any).Image = FakeImage;

    try {
      const result = await imageToJpeg('data:image/png;base64,x', fakeCanvas, 1000);
      expect(result).not.toBe(null);
      expect(result!.wPx).toBe(1000);
      expect(result!.hPx).toBe(500);
      expect(result!.data).toBeInstanceOf(Uint8Array);
    } finally {
      globalThis.Image = OriginalImage;
    }
  });

  it('returns null when the image fails to load', async () => {
    const OriginalImage = globalThis.Image;
    class FailingImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) { queueMicrotask(() => this.onerror && this.onerror()); }
    }
    (globalThis as any).Image = FailingImage;

    try {
      const result = await imageToJpeg('data:image/png;base64,x', fakeCanvas);
      expect(result).toBe(null);
    } finally {
      globalThis.Image = OriginalImage;
    }
  });

  it('returns null when the canvas has no 2D context', async () => {
    const OriginalImage = globalThis.Image;
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 100;
      naturalHeight = 100;
      set src(_v: string) { queueMicrotask(() => this.onload && this.onload()); }
    }
    (globalThis as any).Image = FakeImage;

    try {
      const noCtxCanvas = () => {
        const c = document.createElement('canvas');
        c.getContext = vi.fn(() => null) as any;
        return c;
      };
      const result = await imageToJpeg('data:image/png;base64,x', noCtxCanvas);
      expect(result).toBe(null);
    } finally {
      globalThis.Image = OriginalImage;
    }
  });
});
