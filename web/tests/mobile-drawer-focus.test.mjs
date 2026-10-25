import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fokusAwalDrawer, tahanFokusDrawer } from '../src/services/mobileDrawerFocus.js';

function tombol() {
  return {
    hidden: false,
    focused: false,
    getAttribute: () => null,
    focus() { this.focused = true; },
  };
}

function drawerWith(...elements) {
  return {
    elements,
    focused: false,
    querySelector: () => elements[0] || null,
    querySelectorAll: () => elements,
    contains: (element) => elements.includes(element),
    focus() { this.focused = true; },
  };
}

function keyEvent(target, shiftKey = false) {
  return {
    target,
    shiftKey,
    prevented: false,
    preventDefault() { this.prevented = true; },
  };
}

test('moves focus to the first available item when opening the mobile drawer', () => {
  const first = tombol();
  const drawer = drawerWith(first, tombol());

  assert.equal(fokusAwalDrawer(drawer), true);
  assert.equal(first.focused, true);
});

test('wraps Tab and Shift+Tab within the mobile drawer', () => {
  const first = tombol();
  const last = tombol();
  const drawer = drawerWith(first, last);
  const forward = keyEvent(last);
  const backward = keyEvent(first, true);

  assert.equal(tahanFokusDrawer(forward, drawer), true);
  assert.equal(forward.prevented, true);
  assert.equal(first.focused, true);

  assert.equal(tahanFokusDrawer(backward, drawer), true);
  assert.equal(backward.prevented, true);
  assert.equal(last.focused, true);
});

test('returns keyboard focus entering the drawer to its first or last item', () => {
  const first = tombol();
  const last = tombol();
  const drawer = drawerWith(first, last);
  const outside = {};

  assert.equal(tahanFokusDrawer(keyEvent(outside), drawer), true);
  assert.equal(first.focused, true);
  assert.equal(tahanFokusDrawer(keyEvent(outside, true), drawer), true);
  assert.equal(last.focused, true);
});

test('keeps focus in an empty drawer and skips unavailable controls', () => {
  const unavailable = { ...tombol(), hidden: true };
  const disabled = { ...tombol(), getAttribute: (name) => name === 'aria-disabled' ? 'true' : null };
  const emptyDrawer = drawerWith(unavailable, disabled);
  const event = keyEvent({});

  assert.equal(fokusAwalDrawer(emptyDrawer), false);
  assert.equal(tahanFokusDrawer(event, emptyDrawer), true);
  assert.equal(event.prevented, true);
  assert.equal(emptyDrawer.focused, true);
});
