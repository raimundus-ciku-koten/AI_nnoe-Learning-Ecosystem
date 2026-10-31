import { supabase } from '../lib/supabase.ts';

export const CONTENT_TYPES = Object.freeze({
    template_perangkat: 'Template Perangkat',
    bank_soal: 'Bank Soal Global',
    modul: 'Modul Global',
});
const TYPES = new Set(Object.keys(CONTENT_TYPES));
const STATUSES = new Set(['draft', 'published', 'archived']);
const FIELDS = new Set([
    'id', 'content_type', 'title', 'description', 'content_text', 'subject',
    'question_items', 'answer_key', 'grade_level', 'license_label', 'source_url', 'status', 'version',
    'created_at', 'updated_at', 'published_at',
]);

function teks(value, label, max, { empty = true } = {}) {
    if (typeof value !== 'string') throw new TypeError(`${label} tidak valid.`);
    const normalized = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
    if ((!empty && !normalized) || normalized.length > max) throw new TypeError(`${label} tidak valid.`);
    return normalized;
}

export async function muatKatalogKonten(type) {
    if (type !== null && !TYPES.has(type)) throw new TypeError('Jenis konten tidak valid.');
    const { data, error } = await supabase.rpc('platform_content_list', { p_content_type: type });
    if (error) throw error;
    if (!Array.isArray(data) || data.some((row) => !row ||
        Object.keys(row).some((key) => !FIELDS.has(key)) ||
        typeof row.id !== 'string' || !TYPES.has(row.content_type) ||
        typeof row.title !== 'string' || typeof row.content_text !== 'string' ||
        !Array.isArray(row.question_items) || !row.answer_key || typeof row.answer_key !== 'object' || Array.isArray(row.answer_key) ||
        !STATUSES.has(row.status) || !Number.isSafeInteger(row.version) || row.version < 1)) {
        throw new Error('Daftar katalog konten tidak valid.');
    }
    return data;
}

export async function simpanDrafKonten(input) {
    if (input?.id != null && typeof input.id !== 'string') throw new TypeError('ID konten tidak valid.');
    if (!TYPES.has(input?.contentType)) throw new TypeError('Jenis konten tidak valid.');
    const payload = {
        p_id: input.id || null,
        p_content_type: input.contentType,
        p_title: teks(input.title, 'Judul', 160, { empty: false }),
        p_description: teks(input.description || '', 'Deskripsi', 2000),
        p_content_text: teks(input.contentText || '', 'Isi konten', 30000),
        p_subject: teks(input.subject || '', 'Mata pelajaran', 80),
        p_grade_level: teks(input.gradeLevel || '', 'Jenjang', 80),
        p_license_label: teks(input.licenseLabel || '', 'Lisensi/sumber', 160),
        p_source_url: teks(input.sourceUrl || '', 'URL sumber', 2048),
        p_question_items: input.contentType === 'bank_soal' ? input.questionItems : [],
        p_answer_key: input.contentType === 'bank_soal' ? input.answerKey : {},
    };
    if (!Array.isArray(payload.p_question_items) || !payload.p_answer_key
        || typeof payload.p_answer_key !== 'object' || Array.isArray(payload.p_answer_key)) {
        throw new TypeError('Butir soal atau kunci jawaban global tidak valid.');
    }
    if (payload.p_source_url && !/^https:\/\/[^\s]+$/i.test(payload.p_source_url)) {
        throw new TypeError('URL sumber harus HTTPS.');
    }
    const { data, error } = await supabase.rpc('platform_content_save', payload);
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row.saved_id !== 'string' || !Number.isSafeInteger(row.saved_version)) {
        throw new Error('Supabase tidak mengembalikan revisi konten yang valid.');
    }
    return row;
}

async function aksiKonten(name, id) {
    if (typeof id !== 'string' || !id.trim()) throw new TypeError('ID konten tidak valid.');
    const { error } = await supabase.rpc(name, { p_id: id });
    if (error) throw error;
}

export const terbitkanKonten = (id) => aksiKonten('platform_content_publish', id);
export const arsipkanKonten = (id) => aksiKonten('platform_content_archive', id);

export async function muatKontenGlobalTenant(type = null) {
    if (type !== null && !TYPES.has(type)) throw new TypeError('Jenis konten tidak valid.');
    const { data, error } = await supabase.rpc('tenant_global_content_catalog', { p_content_type: type });
    if (error) throw error;
    if (!Array.isArray(data) || data.some((row) => !row ||
        Object.keys(row).some((key) => key === 'answer_key' || ![
            'id', 'content_type', 'title', 'description', 'content_text', 'question_items',
            'subject', 'grade_level', 'license_label', 'source_url', 'version', 'published_at',
        ].includes(key)) ||
        typeof row.id !== 'string' || !TYPES.has(row.content_type) || row.status === 'draft' ||
        typeof row.title !== 'string' || typeof row.content_text !== 'string' ||
        !Array.isArray(row.question_items) || typeof row.license_label !== 'string' ||
        row.question_items.some((question) => !question || Object.keys(question).some((key) =>
            !['position', 'kind', 'prompt', 'choices'].includes(key)) ||
            !Number.isSafeInteger(question.position) || question.position < 1 ||
            !['pilihan_ganda', 'uraian'].includes(question.kind) ||
            typeof question.prompt !== 'string' || !Array.isArray(question.choices) ||
            question.choices.some((choice) => typeof choice !== 'string')))) {
        throw new Error('Daftar pustaka global tenant tidak valid.');
    }
    return data;
}

export async function imporSoalGlobalKeBank({ contentId, mapel, kelas }) {
    if (typeof contentId !== 'string' || !contentId.trim()) throw new TypeError('ID katalog tidak valid.');
    const subject = teks(mapel, 'Mata pelajaran', 80, { empty: false });
    const className = teks(kelas, 'Kelas', 30, { empty: false });
    const { data, error } = await supabase.rpc('import_published_platform_questions', {
        p_content_id: contentId,
        p_mapel: subject,
        p_kelas: className,
    });
    if (error) throw error;
    const imported = Number(data);
    if (!Number.isSafeInteger(imported) || imported < 1 || imported > 100) {
        throw new Error('Jumlah soal yang diimpor tidak valid.');
    }
    return imported;
}
