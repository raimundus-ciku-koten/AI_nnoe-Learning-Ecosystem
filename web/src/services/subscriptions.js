import { supabase } from '../lib/supabase.ts';

export async function muatLanggananTenant(tenantId) {
  if (!tenantId) throw new Error('Akun sekolah belum memiliki tenant yang valid.');

  const { data, error } = await supabase
    .from('tenant_entitlements')
    .select('plan_id,status,valid_until')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error) throw error;
  return petakanLangganan(data, 'sekolah');
}

export async function muatLanggananPersonal(userId) {
  if (!userId) throw new Error('Akun pengguna tidak tersedia.');

  const { data, error } = await supabase
    .from('personal_entitlements')
    .select('plan_id,status,valid_until')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return petakanLangganan(data, 'personal');
}

function petakanLangganan(data, jenis) {
  if (!data) return null;
  if (typeof data.plan_id !== 'string' || !data.plan_id ||
      !['trial', 'active', 'past_due', 'suspended', 'cancelled'].includes(data.status)) {
    throw new Error(`Data entitlement ${jenis} tidak valid.`);
  }

  let sampai = null;
  if (data.valid_until != null) {
    sampai = new Date(data.valid_until);
    if (Number.isNaN(sampai.getTime())) {
      throw new Error(`Tanggal akhir entitlement ${jenis} tidak valid.`);
    }
  }

  return {
    paketId: data.plan_id,
    status: data.status,
    aktif: ['trial', 'active'].includes(data.status),
    sampai,
  };
}

export async function mulaiCheckoutMidtrans() {
  throw new Error('Checkout dinonaktifkan. Aplikasi beroperasi tanpa pembayaran atau billing.');
}
