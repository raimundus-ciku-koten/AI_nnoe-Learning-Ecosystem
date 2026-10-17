import { before, after, beforeEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { serverTimestamp } from 'firebase/database';

let env;
const databaseUrl = 'https://demo-ainno-default-rtdb.firebaseio.com';
const tenantAdmin = () => env.authenticatedContext('admin-a', {
  role: 'admin_sekolah', tenantId: 'sekolah-a',
}).database(databaseUrl);
const tenantGuru = () => env.authenticatedContext('guru-a', {
  role: 'guru', tenantId: 'sekolah-a',
}).database(databaseUrl);
const superadmin = () => env.authenticatedContext('super-1', {
  role: 'superadmin',
}).database(databaseUrl);

before(async () => {
  const aturan = JSON.parse(readFileSync(
    fileURLToPath(new URL('../../database.rules.json', import.meta.url)),
    'utf8',
  ));
  env = await initializeTestEnvironment({
    projectId: 'demo-ainno',
    database: { rules: JSON.stringify(aturan) },
  });
});

after(async () => { await env?.cleanup(); });

beforeEach(async () => {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async (context) => {
    const database = context.database(databaseUrl);
    await database.ref('chatDirectory').set({
      'admin-a': { role: 'admin_sekolah', tenantId: 'sekolah-a', updatedAt: 1 },
      'guru-a': { role: 'guru', tenantId: 'sekolah-a', updatedAt: 1 },
      'guru-b': { role: 'guru', tenantId: 'sekolah-b', updatedAt: 1 },
      'siswa-a': { role: 'siswa', tenantId: 'sekolah-a', updatedAt: 1 },
      'super-1': { role: 'superadmin', tenantId: '', updatedAt: 1 },
    });
  });
});

describe('Realtime Database chat rules', () => {
  it('mengizinkan percakapan sekolah untuk anggota satu tenant', async () => {
    const metadata = tenantAdmin().ref('chats/d_admin-a_guru-a/meta');
    await assertSucceeds(metadata.set({
      type: 'direct',
      members: { 'admin-a': true, 'guru-a': true },
      createdBy: 'admin-a',
      createdAt: Date.now(),
    }));
  });

  it('menolak anggota lintas tenant pada percakapan baru', async () => {
    const metadata = tenantAdmin().ref('chats/d_admin-a_guru-b/meta');
    await assertFails(metadata.set({
      type: 'direct',
      members: { 'admin-a': true, 'guru-b': true },
      createdBy: 'admin-a',
      createdAt: Date.now(),
    }));
  });

  it('mengizinkan superadmin membuat percakapan dukungan dengan admin sekolah', async () => {
    const metadata = superadmin().ref('chats/d_super-1_admin-a/meta');
    await assertSucceeds(metadata.set({
      type: 'direct',
      members: { 'super-1': true, 'admin-a': true },
      createdBy: 'super-1',
      createdAt: Date.now(),
    }));
  });

  it('mengizinkan superadmin memulai chat lintas tenant dengan seluruh peran terdaftar', async () => {
    const metadata = superadmin().ref('chats/d_super-1_siswa-a/meta');
    await assertSucceeds(metadata.set({
      type: 'direct',
      members: { 'super-1': true, 'siswa-a': true },
      createdBy: 'super-1',
      createdAt: Date.now(),
    }));
    const contact = superadmin().ref('contacts/d_super-1_siswa-a');
    await assertSucceeds(contact.set({
      from: 'super-1',
      to: 'siswa-a',
      status: 'pending',
      names: { 'super-1': 'Super Admin', 'siswa-a': 'Siswa A' },
      createdAt: Date.now(),
    }));
  });

  it('mengizinkan chatDirectory pribadi diperbarui hanya untuk peran dan tenant sendiri', async () => {
    await assertSucceeds(tenantGuru().ref('chatDirectory/guru-a').set({
      role: 'guru',
      tenantId: 'sekolah-a',
      updatedAt: Date.now(),
    }));
    await assertFails(tenantGuru().ref('chatDirectory/guru-a').set({
      role: 'admin_sekolah',
      tenantId: 'sekolah-b',
      updatedAt: Date.now(),
    }));
  });

  it('menyimpan token FCM sebagai string hanya untuk pemilik akun', async () => {
    await assertSucceeds(tenantGuru().ref('fcmTokens/guru-a/device-a').set('fcm-registration-token'));
    await assertFails(tenantAdmin().ref('fcmTokens/guru-a/device-b').set('fcm-registration-token'));
    await assertFails(tenantGuru().ref('fcmTokens/guru-a/device-c').set(1729000000000));
  });

  it('mengizinkan lampiran chat dengan path dan ukuran yang valid', async () => {
    const chatId = 'd_admin-a_guru-a';
    await env.withSecurityRulesDisabled(async (context) => {
      await context.database(databaseUrl).ref(`chats/${chatId}/meta/members`).set({
        'admin-a': true,
        'guru-a': true,
      });
    });
    await assertSucceeds(tenantGuru().ref(`chats/${chatId}/messages/message-a`).set({
      senderId: 'guru-a',
      type: 'image',
      filePath: `chat/guru-a/${chatId}/attachment_a`,
      fileName: 'foto.jpg',
      fileSize: 1024,
      ts: serverTimestamp(),
    }));
  });

  it('menyimpan lampiran Firebase hanya untuk anggota chat dan pemilik unggahan', async () => {
    const chatId = 'd_admin-a_guru-a';
    await env.withSecurityRulesDisabled(async (context) => {
      await context.database(databaseUrl).ref(`chats/${chatId}/meta/members`).set({
        'admin-a': true,
        'guru-a': true,
      });
    });
    const upload = {
      ownerUid: 'guru-a',
      fileName: 'foto.png',
      fileSize: 4,
      contentType: 'image/png',
      data: 'iVBORw==',
      createdAt: serverTimestamp(),
    };
    await assertSucceeds(tenantGuru().ref(`chatAttachments/${chatId}/file_a`).set(upload));
    await assertSucceeds(tenantAdmin().ref(`chatAttachments/${chatId}/file_a`).get());
    await assertFails(env.authenticatedContext('outsider', {
      role: 'guru', tenantId: 'sekolah-a',
    }).database(databaseUrl).ref(`chatAttachments/${chatId}/file_a`).get());
    await assertFails(tenantAdmin().ref(`chatAttachments/${chatId}/file_b`).set(upload));
    await assertFails(tenantGuru().ref(`chatAttachments/${chatId}/file_large`).set({
      ...upload,
      fileSize: 2 * 1024 * 1024 + 1,
      data: 'A'.repeat(2 * 1024 * 1024 + 5),
    }));
  });

  it('menolak path lampiran tidak aman dan ukuran di atas batas', async () => {
    const chatId = 'd_admin-a_guru-a';
    await env.withSecurityRulesDisabled(async (context) => {
      await context.database(databaseUrl).ref(`chats/${chatId}/meta/members`).set({
        'admin-a': true,
        'guru-a': true,
      });
    });
    const pesan = (filePath, fileSize) => ({
      senderId: 'guru-a',
      type: 'file',
      filePath,
      fileName: 'dokumen.pdf',
      fileSize,
      ts: serverTimestamp(),
    });
    await assertFails(tenantGuru().ref(`chats/${chatId}/messages/unsafe`).set(
      pesan(`chat/guru-a/${chatId}/../private.txt`, 1024),
    ));
    await assertFails(tenantGuru().ref(`chats/${chatId}/messages/oversized`).set(
      pesan(`chat/guru-a/${chatId}/dokumen_file`, 2 * 1024 * 1024 + 1),
    ));
  });
});
