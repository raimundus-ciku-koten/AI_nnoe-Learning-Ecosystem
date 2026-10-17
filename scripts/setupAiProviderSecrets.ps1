param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z][a-z0-9-]{4,28}[a-z0-9]$')]
  [string]$ProjectId
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command firebase -ErrorAction SilentlyContinue)) {
  throw 'Firebase CLI tidak ditemukan. Instal firebase-tools lalu jalankan ulang.'
}

foreach ($secretName in @('GROQ_API_KEY', 'CEREBRAS_API_KEY')) {
  Write-Host "Menyiapkan $secretName untuk proyek $ProjectId."
  Write-Host 'Masukkan kunci API provider pada prompt Firebase CLI. Jangan tempelkan kunci ke terminal yang merekam riwayat.'
  & firebase functions:secrets:set $secretName --project $ProjectId
  if ($LASTEXITCODE -ne 0) {
    throw "Gagal menyiapkan $secretName. Periksa akses Secret Manager, billing, dan Firebase CLI."
  }
}

Write-Host 'Kedua secret provider tersimpan di Firebase Secret Manager.'
Write-Host "Deploy Functions setelah secret berhasil disetel: firebase deploy --only functions --project $ProjectId"
