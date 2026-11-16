import { afterEach, describe, expect, it, vi } from 'vitest';
import { emit } from './broadcaster';

describe('emit', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('warns when the API rejects the broadcast with an error status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await emit('a1', 'text_delta', { delta: 'hi' });

    expect(warn).toHaveBeenCalledWith('[broadcaster] text_delta rejected: HTTP 401');
  });

  it('stays quiet on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await emit('a1', 'status', { status: 'running' });

    expect(warn).not.toHaveBeenCalled();
  });

  it('warns instead of throwing when the API is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(emit('a1', 'thought', { content: 'x' })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith('[broadcaster] failed to emit:', 'ECONNREFUSED');
  });
});
