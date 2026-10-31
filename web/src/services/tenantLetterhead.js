import { supabase } from '../lib/supabase.ts';
import { muatPengaturanTenant, simpanKopSuratTenant } from './tenantSettings.js';

export const BUCKET_KOP_SEKOLAH = 'school-letterheads';
export const BATAS_KOP_SEKOLAH_BYTE = 2 * 1024 * 1024;

const MIME_KOP = new Set(['image/png', 'image/jpeg', 'image/webp']);

function pathKopTenant(tenantId) {
    if (typeof tenantId !== 'string' || !tenantId.trim() || tenantId.length > 160 ||
        /[\/\\\u0000-\u001f\u007f]/.test(tenantId)) {
        throw new TypeError('ID tenant tidak valid untuk kop sekolah.');
    }
    return `${tenantId}/letterhead`;
}

async function validasiBerkasKop(file) {
    if (!file || typeof file.arrayBuffer !== 'function' || typeof file.slice !== 'function') {
        throw new TypeError('Pilih berkas gambar kop sekolah yang valid.');
    }
    if (file.size < 1 || file.size > BATAS_KOP_SEKOLAH_BYTE) {
        throw new TypeError('Ukuran kop maksimal 2 MiB.');
    }
    if (!MIME_KOP.has(file.type)) {
        throw new TypeError('Format kop harus PNG, JPEG, atau WebP. SVG tidak diizinkan.');
    }

    const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const png = file.type === 'image/png' &&
        [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => signature[index] === value);
    const jpeg = file.type === 'image/jpeg' &&
        signature[0] === 255 && signature[1] === 216 && signature[2] === 255;
    const webp = file.type === 'image/webp' &&
        String.fromCharCode(...signature.slice(0, 4)) === 'RIFF' &&
        String.fromCharCode(...signature.slice(8, 12)) === 'WEBP';
    if (!png && !jpeg && !webp) throw new TypeError('Isi berkas tidak sesuai dengan format gambar yang dipilih.');
}

function urlAman(signedUrl) {
    let url;
    try {
        url = new URL(signedUrl);
    } catch (error) {
        throw new Error('Supabase Storage tidak mengembalikan URL kop yang valid.', { cause: error });
    }
    const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !localHttp) || url.username || url.password) {
        throw new Error('URL kop sekolah tidak aman.');
    }
    return url.href;
}

export async function buatTautanKopSuratTenant(tenantId, objectPath) {
    const expectedPath = pathKopTenant(tenantId);
    if (objectPath !== expectedPath) throw new TypeError('Path kop tidak cocok dengan tenant aktif.');
    const { data, error } = await supabase.storage
        .from(BUCKET_KOP_SEKOLAH)
        .createSignedUrl(expectedPath, 60 * 60);
    if (error) throw error;
    if (typeof data?.signedUrl !== 'string') throw new Error('URL kop sekolah tidak tersedia.');
    return urlAman(data.signedUrl);
}

export async function unggahKopSuratTenant({ tenantId, userId, file }) {
    const path = pathKopTenant(tenantId);
    if (typeof userId !== 'string' || !userId.trim()) throw new TypeError('Akun admin tidak tersedia.');
    await validasiBerkasKop(file);

    const settings = await muatPengaturanTenant(tenantId);
    if (!settings.kopSuratTersedia) {
        throw new Error('Pengelolaan kop belum tersedia. Migration tenant letterhead perlu diverifikasi dan diterapkan.');
    }

    const { error } = await supabase.storage.from(BUCKET_KOP_SEKOLAH).upload(path, file, {
        cacheControl: '3600',
        contentType: file.type,
        upsert: true,
    });
    if (error) throw error;

    await simpanKopSuratTenant(tenantId, userId, path);
    return { path, url: await buatTautanKopSuratTenant(tenantId, path) };
}

export async function hapusKopSuratTenant({ tenantId, userId }) {
    const path = pathKopTenant(tenantId);
    const settings = await muatPengaturanTenant(tenantId);
    if (!settings.kopSuratTersedia) {
        throw new Error('Pengelolaan kop belum tersedia. Migration tenant letterhead perlu diverifikasi dan diterapkan.');
    }
    if (!settings.kopSuratPath) return { removed: false, assetDeleted: true };

    await simpanKopSuratTenant(tenantId, userId, null);
    const { error } = await supabase.storage.from(BUCKET_KOP_SEKOLAH).remove([path]);
    if (error) return { removed: true, assetDeleted: false };
    return { removed: true, assetDeleted: true };
}