// tests/lib.test.mjs — jalankan: node --test tests/lib.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { csvEscape, buatCsv } from '../src/lib/berkas.js';
import { esc, normal, namaAman } from '../src/lib/teks.js';
import { kodeCadangan, kodeUntuk, cariKodeGanda, rencanaKodeBaru, kodeLayakSimpan } from '../src/lib/kodeSiswa.js';
import { htmlAvatar } from '../src/ui.js';
import { urlFotoAman } from '../src/services/protectedMedia.js';

test('csvEscape: formula injection dinetralkan', () => {
  for (const jahat of ['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\tx', '\rx']) {
    assert.ok(csvEscape(jahat).replace(/^"/, '').startsWith("'"), jahat);
  }
});

test('csvEscape: kutip, koma, baris baru', () => {
  assert.equal(csvEscape('a,b'), '"a,b"');
  assert.equal(csvEscape('say "hi"'), '"say ""hi"""');
  assert.equal(csvEscape('a\nb'), '"a\nb"');
  assert.equal(csvEscape(null), '');
});

test('csvEscape: NISN berawalan 0 tetap teks di Excel, nilai lain tidak berubah', () => {
  assert.equal(csvEscape('0051234567', { teksExcel: true }), '"=""0051234567"""');
  assert.equal(csvEscape('1051234567', { teksExcel: true }), '1051234567');
  assert.equal(csvEscape('0051234567'), '0051234567');
});

test('buatCsv: BOM + CRLF', () => {
  assert.equal(buatCsv([['a', 'b'], ['1', '2']]), '\uFEFFa,b\r\n1,2');
});

test('teks: esc, normal, namaAman', () => {
  assert.equal(esc(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  assert.equal(normal('  ÁNÍ Bü '), 'ani bu');
  assert.equal(namaAman('X IPA/1: ??'), 'X_IPA_1');
  assert.equal(namaAman('///'), 'berkas');
});

test('avatar tidak memuat foto profil Firebase lama dan memakai inisial', () => {
  for (const url of [
    'https://firebasestorage.googleapis.com/v0/b/example/o/fotoProfil%2Fuser.jpg?alt=media',
    'https://example.firebasestorage.app/v0/b/example/o/photo.jpg',
  ]) {
    const avatar = htmlAvatar(url, 'Raimundus Ciku');
    assert.match(avatar, /<span class="ale-avatar"/);
    assert.match(avatar, />RC<\/span>$/);
    assert.doesNotMatch(avatar, /firebase|<img/i);
  }
  assert.match(htmlAvatar('https://lh3.googleusercontent.com/avatar.jpg', 'Raimundus Ciku'), /src="https:\/\/lh3\.googleusercontent\.com\/avatar\.jpg"/);
  assert.match(htmlAvatar('https://project.supabase.co/storage/avatar.jpg', 'Raimundus Ciku'), /src="https:\/\/project\.supabase\.co\/storage\/avatar\.jpg"/);
  assert.match(htmlAvatar('https://cdn.example.com/avatar.jpg', 'Raimundus Ciku'), /<span class="ale-avatar"/);
  assert.match(htmlAvatar('javascript:alert(1)', 'Raimundus Ciku'), /<span class="ale-avatar"/);
});

test('URL foto yang dapat dimuat harus HTTPS dari Google atau Supabase', () => {
  for (const url of [
    'https://lh3.googleusercontent.com/avatar.jpg',
    'https://project.supabase.co/storage/avatar.jpg',
  ]) assert.equal(urlFotoAman(url), true);
  for (const url of [
    'https://firebasestorage.googleapis.com/photo.jpg',
    'https://example.firebasestorage.app/photo.jpg',
    'https://supabase.co.evil.example/photo.jpg',
    'https://evil.example/photo.jpg',
    'http://project.supabase.co/photo.jpg',
    'javascript:alert(1)',
    null,
  ]) assert.equal(urlFotoAman(url), false);
});

test('dokumen HTML aktif tidak membuka koneksi awal ke endpoint Firebase', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /(?:identitytoolkit|securetoken|firestore|firebaseinstallations)\.googleapis\.com/i);
});

test('konfigurasi Firebase root, project alias, dan worker FCM lama tidak tersedia', () => {
  assert.equal(existsSync(new URL('../../firebase.json', import.meta.url)), false);
  assert.equal(existsSync(new URL('../../.firebaserc', import.meta.url)), false);
  assert.equal(existsSync(new URL('../../public/firebase-messaging-sw.js', import.meta.url)), false);
});

test('APK tidak lagi menargetkan Firebase Hosting dan memerlukan domain pengganti', () => {
  const gradle = readFileSync(new URL('../../android-apk/app/build.gradle', import.meta.url), 'utf8');
  const manifest = JSON.parse(readFileSync(new URL('../../android-apk/twa-manifest.json', import.meta.url), 'utf8'));
  assert.match(gradle, /TWA_HOST/);
  assert.match(gradle, /firebaseapp\.com/);
  assert.match(gradle, /placeholderHost/);
  assert.match(gradle, /hostName:\s*normalizedTwaHost/);
  assert.doesNotMatch(gradle, /ainnoe-learning-ecosyste-f7432\.web\.app/i);
  assert.equal(manifest.host, 'APP_DOMAIN_REQUIRED.invalid');
  assert.match(manifest.iconUrl, /APP_DOMAIN_REQUIRED\.invalid/);
});

test('template environment aktif hanya meminta konfigurasi Supabase dan Google Workspace', () => {
  const template = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8');
  assert.match(template, /VITE_SUPABASE_URL=/);
  assert.match(template, /VITE_SUPABASE_ANON_KEY=/);
  assert.doesNotMatch(template, /VITE_FIREBASE_|VITE_RECAPTCHA|VITE_APPCHECK|VITE_USE_EMULATORS/);
});

test('source frontend aktif tidak mengimpor SDK atau memanggil endpoint Firebase', () => {
  const sourceRoot = new URL('../src/', import.meta.url);
  const sourceFiles = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory);
      if (entry.isDirectory()) walk(path);
      else if (/\.(?:js|jsx|ts|tsx)$/.test(entry.name)) sourceFiles.push(path);
    }
  };
  walk(sourceRoot);

  for (const path of sourceFiles) {
    const source = readFileSync(path, 'utf8');
    assert.doesNotMatch(source, /(?:from\s*|import\s*\()\s*['"]firebase(?:\/|['"])/, path.pathname);
    assert.doesNotMatch(
      source,
      /https:\/\/(?:[^/'"\s]+\.)?(?:firebaseio\.com|firebasedatabase\.app|firebasestorage\.app|firebasestorage\.googleapis\.com|cloudfunctions\.net)\b/i,
      path.pathname,
    );
  }
});

test('manifest dan lockfile aktif tidak menyertakan Firebase', () => {
  for (const manifestPath of [
    '../../package.json',
    '../package.json',
    '../../functions/package.json',
    '../../tests-rules/package.json',
  ]) {
    const manifest = JSON.parse(readFileSync(new URL(manifestPath, import.meta.url), 'utf8'));
    const dependencies = Object.keys({
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.optionalDependencies,
      ...manifest.peerDependencies,
    });
    assert.deepEqual(dependencies.filter((name) => /firebase/i.test(name)), [], manifestPath);
  }

  for (const lockfilePath of ['../../package-lock.json', '../package-lock.json']) {
    const lockfile = JSON.parse(readFileSync(new URL(lockfilePath, import.meta.url), 'utf8'));
    const installedPackages = Object.keys(lockfile.packages);
    assert.deepEqual(
      installedPackages.filter((path) => /(?:^|\/)(?:@firebase\/|firebase(?:-|\/|$))/i.test(path)),
      [],
      lockfilePath,
    );
  }

  const rootViteConfig = readFileSync(new URL('../../vite.config.js', import.meta.url), 'utf8');
  assert.doesNotMatch(rootViteConfig, /firebase/i);
});

test('fungsi checkout dan webhook Supabase fail-closed tanpa gateway pembayaran', () => {
  for (const functionName of ['midtrans-checkout', 'midtrans-webhook']) {
    const source = readFileSync(
      new URL(`../../supabase/functions/${functionName}/index.ts`, import.meta.url),
      'utf8',
    );
    assert.match(source, /status:\s*410/, functionName);
    assert.doesNotMatch(source, /midtrans\.com|MIDTRANS_SERVER_KEY|SUPABASE_SERVICE_ROLE_KEY|fetch\s*\(/i, functionName);
  }
  const checkout = readFileSync(
    new URL('../../supabase/functions/midtrans-checkout/index.ts', import.meta.url),
    'utf8',
  );
  assert.match(checkout, /CHECKOUT_DISABLED/);
  const webhook = readFileSync(
    new URL('../../supabase/functions/midtrans-webhook/index.ts', import.meta.url),
    'utf8',
  );
  assert.match(webhook, /PAYMENTS_DISABLED/);
});

test('aplikasi tidak menyediakan alias deployment atau emulator Firebase', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  const deployScripts = Object.keys(manifest.scripts).filter((name) => name.startsWith('deploy'));
  assert.deepEqual(deployScripts, []);
  assert.equal(manifest.scripts['emulator:firebase'], undefined);
  assert.equal(manifest.scripts['test:firebase:rules'], undefined);
  const webManifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.deepEqual(
    Object.keys(webManifest.scripts).filter((name) => /firebase|rules/i.test(name)),
    [],
  );
});

test('entry point Firebase Functions legacy berhenti sebelum memuat Firebase SDK', () => {
  for (const entrypoint of ['index.js', 'chat-functions.js']) {
    const source = readFileSync(new URL(`../../functions/${entrypoint}`, import.meta.url), 'utf8');
    const guardIndex = source.indexOf('throw new Error(');
    const firebaseImportIndex = source.search(/require\(['"]firebase-(?:admin|functions)/);
    assert.ok(guardIndex >= 0, `${entrypoint} must fail closed`);
    assert.ok(firebaseImportIndex < 0 || guardIndex < firebaseImportIndex, `${entrypoint} must guard before Firebase SDK imports`);
  }
});

test('skrip lama tidak mengekspos perintah Firebase atau administrasi', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  const firebaseScripts = Object.keys(manifest.scripts)
    .filter((name) => /firebase|emulator|rules/i.test(name));
  assert.deepEqual(firebaseScripts, []);
  for (const retiredScript of ['seed', 'set-role', 'emulator', 'deploy']) {
    assert.equal(manifest.scripts[retiredScript], undefined, `${retiredScript} must stay retired`);
  }
  for (const retiredPath of [
    '../../scripts/seed.js',
    '../../scripts/setRole.js',
    '../../scripts/deploySpark.js',
    '../../scripts/setupAiProviderSecrets.ps1',
  ]) {
    assert.equal(existsSync(new URL(retiredPath, import.meta.url)), false, `${retiredPath} must stay retired`);
  }
});

test('skrip mutasi Firebase dan aturan lama hanya menjadi guard arsip', () => {
  const archivedPaths = [
    '../../scripts/bootstrap.ts',
    '../../scripts/syncDirectory.js',
    '../../scripts/secureProfilePhotos.js',
    '../../scripts/secureChatAttachments.js',
    '../../firestore.rules.test.mjs',
    './database.rules.test.mjs',
    './firestore.rules.test.mjs',
    './rules/siswa.rules.test.js',
    '../../tests-rules/rules.test.js',
  ];
  for (const archivedPath of archivedPaths) {
    const source = readFileSync(new URL(archivedPath, import.meta.url), 'utf8');
    assert.match(source, /^throw new Error\(.+arsip/i, archivedPath);
    assert.doesNotMatch(source, /firebase-admin|firebase\/firestore|firebase emulators/i, archivedPath);
  }
});

test('manifest proyek tidak memasang atau menyediakan perintah Firebase', () => {
  const manifestPaths = [
    '../../package.json',
    '../package.json',
    '../../functions/package.json',
    '../../tests-rules/package.json',
  ];
  for (const manifestPath of manifestPaths) {
    const manifest = JSON.parse(readFileSync(new URL(manifestPath, import.meta.url), 'utf8'));
    const packages = [
      ...Object.keys(manifest.dependencies || {}),
      ...Object.keys(manifest.devDependencies || {}),
      ...Object.keys(manifest.optionalDependencies || {}),
    ];
    assert.deepEqual(packages.filter((name) => /firebase/i.test(name)), [], manifestPath);
    assert.deepEqual(
      Object.keys(manifest.scripts || {}).filter((name) => /firebase|emulator|rules/i.test(name)),
      [],
      manifestPath,
    );
  }
});

test('hosted schema audit script contains read-only SQL only', () => {
  const auditSql = readFileSync(new URL('../../supabase/audit_hosted_schema.sql', import.meta.url), 'utf8')
    .replace(/--.*$/gm, '')
    .trim();
  assert.match(auditSql, /^select\b/i);
  assert.doesNotMatch(auditSql, /\b(insert|update|delete|alter|create|drop|grant|revoke|truncate)\b/i);
  assert.match(auditSql, /'feature_relation_presence'/i);
  assert.match(auditSql, /'type_schema', column_info\.udt_schema/i);
  assert.match(auditSql, /'type_name', column_info\.udt_name/i);
  assert.match(auditSql, /'identity', column_info\.is_identity/i);
  assert.match(auditSql, /'generated', column_info\.is_generated/i);
  assert.match(auditSql, /from pg_indexes/i);
  assert.match(auditSql, /'index'/i);
  assert.match(auditSql, /'type'/i);
  assert.match(auditSql, /type_info\.typtype in \('d', 'e', 'r', 'm'\)/i);
  assert.match(auditSql, /from pg_trigger as trigger_info/i);
  assert.match(auditSql, /pg_get_triggerdef\(trigger_info\.oid\)/i);
  assert.match(auditSql, /trigger_info\.tgenabled/i);
  assert.match(auditSql, /not trigger_info\.tgisinternal/i);
  assert.match(auditSql, /relation\.table_type in \('BASE TABLE', 'VIEW', 'FOREIGN'\)/i);
  assert.match(auditSql, /relation\.relkind = 'm'/i);
  assert.match(auditSql, /case when routine_info\.prokind in \('f', 'p'\)/i);
  assert.match(auditSql, /pg_get_constraintdef/i);
  assert.match(auditSql, /aclexplode/i);
  assert.match(auditSql, /acldefault\('s'/i);
  assert.match(auditSql, /acldefault\('n'/i);
  assert.match(auditSql, /acldefault\('r'/i);
  assert.match(auditSql, /acldefault\('f'/i);
  assert.match(auditSql, /grantee = 0 then 'PUBLIC'/i);
  assert.match(auditSql, /'column_grant'/i);
  assert.match(auditSql, /'default_grant'/i);
  assert.match(auditSql, /aclexplode\(\s*attribute\.attacl\s*\)/i);
  assert.doesNotMatch(auditSql, /'\{\}'::aclitem\[\]/i);
  const featureRelations = [
    'school_access_index',
    'user_encryption_keys',
    'drive_file_index',
    'drive_file_access',
    'drive_file_key_envelopes',
    'security_audit',
    'tenant_entitlements',
    'students',
    'attendance_records',
    'testimonials',
    'school_announcements',
    'school_units',
    'chat_conversations',
    'chat_messages',
    'chat_read_receipts',
    'chat_inbox',
    'chat_contacts',
    'chat_presence',
    'billing_plans',
    'personal_entitlements',
    'payment_orders',
    'testimonial_submissions',
    'question_bank',
    'web_push_subscriptions',
    'chat_push_dispatches',
    'student_account_links',
    'student_account_link_audit',
    'online_exams',
    'online_exam_items',
    'online_exam_attempts',
    'student_class_schedule',
    'student_learning_materials',
    'student_guardian_links',
    'student_guardian_link_audit',
    'platform_content_catalog',
    'trial_registrations',
  ];
  for (const featureRelation of featureRelations) {
    assert.match(auditSql, new RegExp(`'${featureRelation}'`));
  }

  const migrationFiles = readdirSync(new URL('../../supabase/migrations/', import.meta.url))
    .filter((file) => file.endsWith('.sql'));
  const definedRelations = new Set();
  for (const file of migrationFiles) {
    const migration = readFileSync(
      new URL(`../../supabase/migrations/${file}`, import.meta.url),
      'utf8',
    );
    for (const match of migration.matchAll(
      /\bcreate\s+(?:(?:table)(?:\s+if\s+not\s+exists)?|(?:or\s+replace\s+)?view)\s+public\.([a-z_]+)/gi,
    )) {
      definedRelations.add(match[1]);
    }
  }
  for (const foundationRelation of [
    'platform_audit',
    'platform_control',
    'platform_public_config',
    'profiles',
    'tenants',
    'user_allowlist',
  ]) {
    definedRelations.delete(foundationRelation);
  }
  assert.deepEqual([...featureRelations].sort(), [...definedRelations].sort());
});

test('kodeCadangan: deterministik & kompatibel dengan format lama', () => {
  const s = { nama: 'Ani', nisn: '0051234567', kelas: 'X-1' };
  assert.equal(kodeCadangan(s), kodeCadangan({ ...s }));
  assert.match(kodeCadangan(s), /^ALE-X1-[0-9A-Z]{6}-4567$/);
  assert.match(kodeCadangan({ nama: 'Tanpa' }), /^ALE-KLS-[0-9A-Z]{6}-[0-9A-Z]{4}$/);
});

test('kodeUntuk: prioritas tersimpan → pembuat → cadangan', () => {
  const s = { nama: 'A', kelas: 'X' };
  assert.equal(kodeUntuk({ ...s, kodeUnik: ' KODE-1 ' }, () => 'LAIN'), 'KODE-1');
  assert.equal(kodeUntuk(s, () => 'PEMBUAT'), 'PEMBUAT');
  assert.equal(kodeUntuk(s, () => { throw new Error('x'); }), kodeCadangan(s));
  assert.equal(kodeUntuk(s, null), kodeCadangan(s));
});

test('cariKodeGanda', () => {
  assert.deepEqual([...cariKodeGanda(['A', 'B', 'A', 'C', 'A', 'B'])].sort(), ['A', 'B']);
});

test('rencanaKodeBaru: unik, lewati yang tersimpan & tanpa id, tangani tabrakan', () => {
  const semua = [
    { id: '1', nama: 'Kembar', nisn: '', kelas: 'X' },
    { id: '2', nama: 'Kembar', nisn: '', kelas: 'X' },        // data identik → kode dasar sama
    { id: '3', nama: 'Sudah', kelas: 'X', kodeUnik: 'ADA-0001' },
    { nama: 'TanpaId', kelas: 'X' },
  ];
  const { rencana, tanpaId } = rencanaKodeBaru(semua, semua);
  assert.equal(rencana.length, 2);
  assert.equal(tanpaId.length, 1);
  assert.notEqual(rencana[0].kode, rencana[1].kode);
  assert.ok(rencana.every((r) => kodeLayakSimpan(r.kode)));
  assert.ok(!rencana.some((r) => r.kode === 'ADA-0001'));
});

test('rencanaKodeBaru: pembuat aplikasi yang menghasilkan kode tak layak → pakai cadangan', () => {
  const s = [{ id: '1', nama: 'A', kelas: 'X' }];
  const { rencana } = rencanaKodeBaru(s, s, () => 'kode dengan spasi/garis');
  assert.equal(rencana[0].kode, kodeCadangan(s[0]));
});
