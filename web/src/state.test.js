import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getState,
  pilihStateAuth,
  setState,
  shallowEqual,
  subscribeSelector,
} from './state.js';

describe('state selectors', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('only notifies a selector when its selected domain changes', () => {
    const initial = pilihStateAuth();
    const listener = vi.fn();
    const unsubscribe = subscribeSelector(pilihStateAuth, listener, shallowEqual);

    setState({ chats: [{ id: 'chat-1' }] });
    expect(listener).not.toHaveBeenCalled();

    const user = { uid: 'user-1' };
    setState({ user });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ user }));

    unsubscribe();
    setState({ user: initial.user, profile: initial.profile });
  });
});
