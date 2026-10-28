import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  bacaPreferensiGuru,
  dengarkanPreferensiGuru,
  preferensiGuruDefault,
  simpanPreferensiGuru,
} from './teacherPreferences.js';

describe('teacher display preferences', () => {
  beforeEach(() => {
    const values = new Map();
    const listeners = new Map();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: (key) => values.delete(key),
        clear: () => values.clear(),
      },
      addEventListener: (name, handler) => listeners.set(name, handler),
      removeEventListener: (name) => listeners.delete(name),
      dispatchEvent: (event) => {
        listeners.get(event.type)?.(event);
        return true;
      },
    });
    vi.stubGlobal('CustomEvent', class {
      constructor(type, options) {
        this.type = type;
        this.detail = options.detail;
      }
    });
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses default settings when an account has not saved preferences', () => {
    expect(bacaPreferensiGuru('user-1', 'guru')).toEqual(preferensiGuruDefault());
  });

  it('stores separate preferences by account and active role', () => {
    simpanPreferensiGuru('user-1', 'guru_bk', { textSize: 'large', motion: 'reduced' });
    expect(bacaPreferensiGuru('user-1', 'guru_bk')).toEqual({
      textSize: 'large',
      motion: 'reduced',
    });
    expect(bacaPreferensiGuru('user-1', 'guru')).toEqual(preferensiGuruDefault());
    expect(bacaPreferensiGuru('user-2', 'guru_bk')).toEqual(preferensiGuruDefault());
  });

  it('notifies the app shell after persisting preferences', () => {
    const callback = vi.fn();
    const unsubscribe = dengarkanPreferensiGuru(callback);
    simpanPreferensiGuru('user-1', 'guru', { textSize: 'large', motion: 'system' });
    expect(callback).toHaveBeenCalledWith({
      userId: 'user-1',
      role: 'guru',
      preferences: { textSize: 'large', motion: 'system' },
    });
    unsubscribe();
  });

  it('falls back safely for malformed settings and rejects incomplete account context', () => {
    window.localStorage.setItem('ale:teacher-preferences:v1:user-1:guru', '{"textSize":"huge"}');
    expect(bacaPreferensiGuru('user-1', 'guru')).toEqual(preferensiGuruDefault());
    expect(() => bacaPreferensiGuru('', 'guru')).toThrow('Akun dan peran aktif diperlukan');
    expect(() => simpanPreferensiGuru('user-1', 'guru', {
      textSize: 'large',
      motion: 'unexpected',
    })).toThrow('Nilai preferensi tampilan tidak valid');
    expect(window.localStorage.getItem('ale:teacher-preferences:v1:user-1:guru'))
      .toBe('{"textSize":"huge"}');
  });
});
