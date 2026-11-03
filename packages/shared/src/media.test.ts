import { describe, expect, it } from 'vitest';
import { CreateMediaBody } from './api';
import { CreateJobBody, StockItem, StockSearchOutput } from './job';
import { isMediaMimeType, MAX_MEDIA_BYTES } from './limits';
import {
  isAllowedExternalUrl,
  isExternalSrc,
  isInMediaFolder,
  mediaFolder,
  mediaPath,
} from './storage-paths';

const uid = '0b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const id = '6f1d3c3e-2b7a-4c1e-9f0a-1d2e3f4a5b6c';

const stock: StockItem = {
  provider: 'pexels',
  providerId: '3571264',
  kind: 'video',
  url: 'https://videos.pexels.com/video-files/3571264/3571264-hd_1080_1920_30fps.mp4',
  thumbnailUrl: 'https://images.pexels.com/videos/3571264/free-video-3571264.jpg',
  width: 1080,
  height: 1920,
  durationMs: 12000,
  pageUrl: 'https://www.pexels.com/video/3571264/',
  author: 'Jane Doe',
  authorUrl: 'https://www.pexels.com/@jane',
};

describe('media paths', () => {
  it('builds library keys', () => {
    expect(mediaFolder(uid)).toBe(`${uid}/media`);
    expect(mediaPath(uid, `${id}.mp4`)).toBe(`${uid}/media/${id}.mp4`);
  });

  it('accepts only files directly in the user media folder', () => {
    expect(isInMediaFolder(`${uid}/media/${id}.mp4`, uid)).toBe(true);
    expect(isInMediaFolder(`other/media/${id}.mp4`, uid)).toBe(false);
    expect(isInMediaFolder(`${uid}/media/`, uid)).toBe(false);
    expect(isInMediaFolder(`${uid}/media/..`, uid)).toBe(false);
    expect(isInMediaFolder(`${uid}/media/a/b.mp4`, uid)).toBe(false);
    expect(isInMediaFolder(`${uid}/p1/voiceover/a.wav`, uid)).toBe(false);
  });

  it('allows https Pexels CDN URLs only', () => {
    expect(isAllowedExternalUrl(stock.url)).toBe(true);
    expect(isAllowedExternalUrl(stock.thumbnailUrl)).toBe(true);
    for (const bad of [
      'http://videos.pexels.com/a.mp4',
      'https://evil.test/a.mp4',
      'https://videos.pexels.com.evil.test/a.mp4',
      'https://videos.pexels.com@evil.test/a.mp4',
      'https://videos.pexels.com:8443/a.mp4',
      'https://videos.pexels.com\\@evil.test/a.mp4',
      'https://user:pw@videos.pexels.com/a.mp4',
      'https://www.pexels.com/video/1/',
      'javascript:alert(1)',
      `https://images.pexels.com/${'a'.repeat(2100)}`,
    ]) {
      expect(isAllowedExternalUrl(bad), bad).toBe(false);
    }
  });

  it('tells URLs from Storage paths', () => {
    expect(isExternalSrc(stock.url)).toBe(true);
    expect(isExternalSrc(`${uid}/media/${id}.mp4`)).toBe(false);
  });
});

describe('CreateMediaBody', () => {
  const upload = {
    origin: 'upload',
    id,
    kind: 'video',
    storagePath: `${uid}/media/${id}.mp4`,
    thumbnailPath: `${uid}/media/${id}.thumb.jpg`,
    mimeType: 'video/mp4',
    sizeBytes: 1234,
    durationMs: 4200,
    width: 1080,
    height: 1920,
    name: '  beach.mp4 ',
  };

  it('accepts an upload and trims the name', () => {
    const parsed = CreateMediaBody.parse(upload);
    expect(parsed.origin === 'upload' && parsed.name).toBe('beach.mp4');
  });

  it('rejects unsupported types and oversized files', () => {
    expect(CreateMediaBody.safeParse({ ...upload, mimeType: 'video/x-msvideo' }).success).toBe(
      false,
    );
    expect(CreateMediaBody.safeParse({ ...upload, sizeBytes: MAX_MEDIA_BYTES + 1 }).success).toBe(
      false,
    );
    expect(isMediaMimeType('image/webp')).toBe(true);
    expect(isMediaMimeType('toString')).toBe(false);
  });

  it('accepts a stock item from an allowed host only', () => {
    expect(CreateMediaBody.safeParse({ origin: 'stock', item: stock }).success).toBe(true);
    const evil = { ...stock, url: 'https://evil.test/a.mp4' };
    expect(CreateMediaBody.safeParse({ origin: 'stock', item: evil }).success).toBe(false);
  });
});

describe('stock search', () => {
  it('accepts a stock_search job and defaults the page', () => {
    const body = CreateJobBody.parse({
      type: 'stock_search',
      projectId: id,
      input: { query: ' ocean ', kind: 'video' },
    });
    expect(body.input).toEqual({ query: 'ocean', kind: 'video', page: 1 });
  });

  it('rejects empty queries', () => {
    const body = { type: 'stock_search', projectId: id, input: { query: '  ', kind: 'image' } };
    expect(CreateJobBody.safeParse(body).success).toBe(false);
  });

  it('parses search output', () => {
    const out = { items: [stock], page: 1, hasMore: true, totalResults: 120 };
    expect(StockSearchOutput.parse(out)).toEqual(out);
  });
});
