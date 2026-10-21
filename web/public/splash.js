(() => {
  const splash = document.getElementById('splash');
  const reloadButton = document.getElementById('splashMuatUlang');
  if (!splash) return;

  const showFailure = (message) => {
    const currentSplash = document.getElementById('splash');
    if (!currentSplash) return;
    currentSplash.className = 'splash splash--gagal';
    const messageElement = currentSplash.querySelector('.splash__pesan');
    if (messageElement) messageElement.textContent = message;
  };

  reloadButton?.addEventListener('click', () => window.location.reload());
  window.setTimeout(() => {
    showFailure('Memuat lebih lama dari biasanya. Periksa koneksi internet Anda, lalu muat ulang.');
  }, 15000);

  window.addEventListener('error', (event) => {
    const target = event.target;
    const failedModule = target instanceof HTMLScriptElement && target.type === 'module';
    const failedJavaScript = target === window && Boolean(event.error);
    if (!failedModule && !failedJavaScript) return;
    showFailure('Aplikasi gagal dimuat. Muat ulang halaman; bila berulang, hubungi admin.');
  }, true);
})();
