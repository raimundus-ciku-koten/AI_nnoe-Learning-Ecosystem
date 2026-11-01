---
description: "Tinjau arsitektur folder atau modul terhadap skalabilitas, keterpeliharaan, dan kopling"
name: "Tinjauan arsitektur"
argument-hint: "Folder atau modul yang ditinjau, misalnya src/services"
agent: "ask"
---
Bertindaklah sebagai software architect senior. Tinjau target berikut: `${input:target:folder atau modul}`.

Analisis batas modul, arah dependensi, titik kopling erat, dan risiko skalabilitas. Gunakan struktur serta kode workspace sebagai bukti; bedakan fakta dari asumsi dan jangan menyimpulkan tanpa bukti yang cukup. Jangan mengubah kode.

Sajikan hasil dalam bahasa Indonesia dengan urutan:
1. Ringkasan kondisi saat ini.
2. Lima temuan yang diurutkan berdasarkan tingkat risiko. Untuk tiap temuan, sertakan bukti/lokasi, dampak, dan alasan penilaian.
3. Rekomendasi perbaikan bertahap dengan estimasi usaha kecil, sedang, atau besar.

Jika target tidak diberikan atau tidak dapat diidentifikasi, tanyakan klarifikasi sebelum melanjutkan. Jika bukti tidak tersedia, nyatakan "PERLU KONFIRMASI".
