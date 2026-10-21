/**
 * @file Generator AI provider eksternal untuk perangkat ajar.
 */

import { getState } from '../../../state.js';
import { generateBrowserPlanning } from '../../../services/browserAi.js';

export class AiError extends Error {
  /** @param {string} kode @param {string} [detail] */
  constructor(kode, detail = '') {
    super(kode);
    this.name = 'AiError';
    this.kode = kode;
    this.detail = detail;
  }
}

/** @param {{paketId:string,jenis:'atp'|'kktp'|'modul',noUnit?:number,sinyal?:AbortSignal}} p */
export async function buatDenganAi({ paketId, jenis, noUnit, sinyal }) {
  const uid = getState().user?.uid;
  if (!uid) throw new AiError('AI_BELUM_LOGIN');
  try {
    return await generateBrowserPlanning({ uid, paketId, jenis, noUnit, sinyal });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new AiError('AI_GAGAL', error?.message || 'Generator AI tidak dapat menyelesaikan permintaan.');
  }
}
