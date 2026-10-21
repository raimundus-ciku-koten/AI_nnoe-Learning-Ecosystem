import { after, before, beforeEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';

let env;
const penyimpanan = (uid) => env.authenticatedContext(uid).storage();
const tanpaLogin = () => env.unauthenticatedContext().storage();
const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-ainno',
    storage: {
      rules: readFileSync(fileURLToPath(new URL('../../storage.rules', import.meta.url)), 'utf8'),
    },
  });
});

after(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearStorage(); });

describe('Firebase Storage access', () => {
  it('mengizinkan foto profil dibaca pengguna login dan hanya ditulis pemilik', async () => {
    const foto = ref(penyimpanan('guru-a'), 'fotoProfil/guru-a.jpg');
    await assertSucceeds(uploadBytes(foto, bytes, { contentType: 'image/jpeg' }));
    await assertSucceeds(getBytes(ref(penyimpanan('guru-b'), 'fotoProfil/guru-a.jpg')));
    await assertFails(uploadBytes(
      ref(penyimpanan('guru-b'), 'fotoProfil/guru-a.jpg'),
      bytes,
      { contentType: 'image/jpeg' },
    ));
    await assertFails(deleteObject(ref(penyimpanan('guru-b'), 'fotoProfil/guru-a.jpg')));
    await assertSucceeds(deleteObject(foto));
  });

  it('membatasi foto profil yang disimpan menjadi maksimal 128 KiB JPEG', async () => {
    await assertSucceeds(uploadBytes(
      ref(penyimpanan('guru-a'), 'fotoProfil/guru-a.jpg'),
      new Uint8Array(128 * 1024),
      { contentType: 'image/jpeg' },
    ));
    await assertFails(uploadBytes(
      ref(penyimpanan('guru-b'), 'fotoProfil/guru-b.jpg'),
      new Uint8Array(128 * 1024 + 1),
      { contentType: 'image/jpeg' },
    ));
  });

  it('menolak akses Storage tanpa autentikasi dan format foto yang tidak valid', async () => {
    const foto = ref(penyimpanan('guru-a'), 'fotoProfil/guru-a.jpg');
    await assertSucceeds(uploadBytes(foto, bytes, { contentType: 'image/jpeg' }));
    await assertFails(getBytes(ref(tanpaLogin(), 'fotoProfil/guru-a.jpg')));
    await assertFails(uploadBytes(
      ref(penyimpanan('guru-a'), 'fotoProfil/other-user.jpg'),
      bytes,
      { contentType: 'image/jpeg' },
    ));
    await assertFails(uploadBytes(
      ref(penyimpanan('guru-a'), 'fotoProfil/guru-a.jpg'),
      bytes,
      { contentType: 'image/svg+xml' },
    ));
  });

  it('menolak akses klien langsung ke lampiran chat', async () => {
    await assertFails(uploadBytes(
      ref(penyimpanan('guru-a'), 'chat/guru-a/chat-a/file.pdf'),
      bytes,
      { contentType: 'application/pdf' },
    ));
    await env.withSecurityRulesDisabled(async (context) => {
      await uploadBytes(
        ref(context.storage(), 'chat/guru-a/chat-a/file.pdf'),
        bytes,
        { contentType: 'application/pdf' },
      );
    });
    await assertFails(getBytes(ref(penyimpanan('guru-a'), 'chat/guru-a/chat-a/file.pdf')));
  });
});
