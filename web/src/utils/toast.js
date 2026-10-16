// web/src/utils/toast.js
/**
 * Re-export dari components/toast.js (satu-satunya sumber toast).
 * Ada supaya view chat yang mengimpor '../../utils/toast.js' tidak perlu diubah.
 *
 *   import { toast } from '../../utils/toast.js';
 *   toast('Berhasil disimpan', 'success');
 *   toast('Gagal terhubung', 'error', 8000);
 */
export { toast, alertToast } from '../components/toast.js';
export { default } from '../components/toast.js';
