import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pasangTurnstile } from './turnstile.js';

test('Turnstile returns only verified tokens and resets or removes its widget', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'turnstile');
  let callbacks;
  const calls = [];
  globalThis.turnstile = {
    render(container, options) {
      assert.equal(container.id, 'login-captcha');
      assert.equal(options.sitekey, 'public-site-key');
      assert.equal(options.appearance, 'always');
      callbacks = options;
      return 'widget-1';
    },
    reset(id) { calls.push(['reset', id]); },
    remove(id) { calls.push(['remove', id]); },
  };

  try {
    const widget = await pasangTurnstile({ id: 'login-captcha' }, ' public-site-key ');
    assert.equal(widget.token(), '');
    callbacks.callback('verified-token');
    assert.equal(widget.token(), 'verified-token');
    assert.equal(widget.errorCode(), '');
    callbacks['error-callback']('110200');
    assert.equal(widget.token(), '');
    assert.equal(widget.errorCode(), '110200');
    callbacks['error-callback']('unsafe-code');
    assert.equal(widget.errorCode(), '');
    callbacks['error-callback']('110200');
    callbacks['expired-callback']();
    assert.equal(widget.token(), '');
    assert.equal(widget.errorCode(), '');
    callbacks.callback('another-token');
    widget.reset();
    assert.equal(widget.token(), '');
    assert.equal(widget.errorCode(), '');
    widget.remove();
    assert.deepEqual(calls, [['reset', 'widget-1'], ['remove', 'widget-1']]);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'turnstile', previous);
    else delete globalThis.turnstile;
  }
});

test('Turnstile rejects missing container or site key', async () => {
  await assert.rejects(pasangTurnstile(null, 'site-key'), /belum dikonfigurasi/);
  await assert.rejects(pasangTurnstile({}, ''), /belum dikonfigurasi/);
});
