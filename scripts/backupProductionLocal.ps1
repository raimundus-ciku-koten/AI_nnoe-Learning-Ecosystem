param(
  [ValidateSet('Production', 'Staging')]
  [string]$Target = 'Production'
)

$ErrorActionPreference = 'Stop'

$projectRefs = @{
  Production = 'jvcrmzmuxgyuetkjqady'
  Staging = 'samszhfyhbjuculrcffg'
}
$projectRef = $projectRefs[$Target]
$targetSlug = $Target.ToLowerInvariant()
$backupRoot = Join-Path $env:LOCALAPPDATA "AI_nnoe\$targetSlug-backups"
$image = 'supabase/postgres:17.11.0.007@sha256:b0463b9ab930a3535478d529b915d37def49d5a8fb0cb1927929e96af992b519'
$containerName = "ale-$targetSlug-restore-$([Guid]::NewGuid().ToString('N'))"
$containerStarted = $false
$encryptedPath = $null
$backupKey = $null
$databasePassword = $null
$connectionString = $null
$safeConnectionString = $null
$pgPassLine = $null
$containerPassword = $null
$secureUri = $null
$secureKey = $null
$keyBytes = $null

function ConvertTo-PlainText([Security.SecureString]$value) {
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($value)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

function Quote-Argument([string]$value) {
  return '"' + $value.Replace('"', '\"') + '"'
}

function New-ProcessStartInfo(
  [string]$filePath,
  [string[]]$arguments,
  [bool]$redirectStandardInput = $false,
  [bool]$redirectStandardOutput = $false
) {
  $info = New-Object System.Diagnostics.ProcessStartInfo
  $info.FileName = $filePath
  $info.Arguments = (($arguments | ForEach-Object { Quote-Argument $_ }) -join ' ')
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  $info.RedirectStandardInput = $redirectStandardInput
  $info.RedirectStandardOutput = $redirectStandardOutput
  return $info
}

function ConvertTo-SecureUri([string]$connectionString) {
  try {
    $uri = [Uri]$connectionString
  } catch {
    throw "Connection URI $Target tidak valid."
  }

  if ($uri.Scheme -notin @('postgres', 'postgresql') -or
      $uri.Port -ne 5432 -or $uri.AbsolutePath.Trim('/') -ne 'postgres') {
    throw 'URI harus memakai PostgreSQL, port 5432, dan database postgres.'
  }

  $userInfo = [Uri]::UnescapeDataString($uri.UserInfo)
  $separator = $userInfo.IndexOf(':')
  if ($separator -lt 1 -or $separator -eq ($userInfo.Length - 1)) {
    throw 'URI harus menyertakan username dan password.'
  }
  $username = $userInfo.Substring(0, $separator)
  $script:databasePassword = $userInfo.Substring($separator + 1)

  $directHost = "db.$projectRef.supabase.co"
  $directProject = $uri.Host -eq $directHost -and $username -eq 'postgres'
  $poolerProject = $uri.Host -match '^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$' -and
    $username -eq "postgres.$projectRef"
  if (-not $directProject -and -not $poolerProject) {
    throw "URI ditolak: target harus database project $Target yang telah diverifikasi."
  }

  $builder = New-Object System.UriBuilder -ArgumentList $uri
  $builder.UserName = [Uri]::EscapeDataString($username)
  $builder.Password = ''
  $query = $uri.Query.TrimStart('?')
  if ($query -match '(?i)(?:^|&)sslmode=([^&]+)') {
    if ($Matches[1] -notin @('require', 'verify-ca', 'verify-full')) {
      throw 'sslmode harus require, verify-ca, atau verify-full.'
    }
  } else {
    $query = if ($query) { "$query&sslmode=require" } else { 'sslmode=require' }
  }
  $builder.Query = $query
  return $builder.Uri.AbsoluteUri
}

function Escape-PgPassField([string]$value) {
  return $value.Replace('\', '\\').Replace(':', '\:')
}

function Set-PrivateAcl([string]$path) {
  $account = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  & icacls.exe $path /inheritance:r /grant:r "${account}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Tidak dapat membatasi ACL folder lokal: $path"
  }
}

function Test-ContainerInitialized([string]$name) {
  $previousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $logs = & docker logs --since 5s $name 2>&1
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousPreference
  }
  if ($exitCode -ne 0) {
    throw 'Tidak dapat memeriksa status inisialisasi PostgreSQL lokal.'
  }
  return ($logs -join "`n").Contains('PostgreSQL init process complete; ready for start up.')
}

function Copy-ProcessOutput(
  [Diagnostics.Process]$source,
  [Diagnostics.Process]$destination
) {
  $copyError = $null
  try {
    $source.StandardOutput.BaseStream.CopyToAsync(
      $destination.StandardInput.BaseStream
    ).GetAwaiter().GetResult()
  } catch {
    $copyError = $_
  } finally {
    $destination.StandardInput.Close()
  }
  if ($copyError -and -not $source.HasExited) {
    Stop-Process -Id $source.Id -Force -ErrorAction SilentlyContinue
  }
  $source.WaitForExit()
  $destination.WaitForExit()
  if ($copyError) { throw $copyError }
  if ($source.ExitCode -ne 0) {
    throw "$($source.StartInfo.FileName) gagal dengan kode $($source.ExitCode)."
  }
  if ($destination.ExitCode -ne 0) {
    throw "$($destination.StartInfo.FileName) gagal dengan kode $($destination.ExitCode)."
  }
}

try {
  foreach ($name in @('docker', 'node', 'icacls')) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
      throw "Perangkat '$name' tidak ditemukan di PATH."
    }
  }

  & docker version --format '{{.Server.Version}}' | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw 'Docker daemon lokal tidak tersedia.'
  }

  $secureUri = Read-Host 'Tempel URI koneksi PostgreSQL Production (input tersembunyi)' -AsSecureString
  $connectionString = ConvertTo-PlainText $secureUri
  $safeConnectionString = ConvertTo-SecureUri $connectionString
  $connectionString = $null
  $secureUri.Dispose()
  $secureUri = $null

  $secureKey = Read-Host 'Masukkan BACKUP_ENCRYPTION_KEY base64 32 byte (input tersembunyi)' -AsSecureString
  $backupKey = ConvertTo-PlainText $secureKey
  $secureKey.Dispose()
  $secureKey = $null
  $keyBytes = [Convert]::FromBase64String($backupKey)
  if ($keyBytes.Length -ne 32 -or [Convert]::ToBase64String($keyBytes) -ne $backupKey) {
    throw 'Kunci harus berupa base64 kanonis dari tepat 32 byte acak.'
  }
  [Array]::Clear($keyBytes, 0, $keyBytes.Length)

  New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
  Set-PrivateAcl $backupRoot
  $parsedUri = [Uri]$safeConnectionString
  $decodedUser = [Uri]::UnescapeDataString($parsedUri.UserInfo)
  if ($productionPassword -match '[\r\n]') {
    throw 'Password URI tidak boleh berisi baris baru.'
  }
  $pgPassLine = "$($parsedUri.Host):$($parsedUri.Port):postgres:${decodedUser}:$(Escape-PgPassField $databasePassword)"
  $databasePassword = $null

  $containerPassword = [Guid]::NewGuid().ToString('N')
  $dockerPath = (Get-Command docker).Source
  $containerArguments = @(
    'run', '--detach', '--rm', '--name', $containerName,
    '--tmpfs', '/run/ale-backup:rw,noexec,nosuid,size=64k',
    '--tmpfs', '/var/lib/postgresql/data:rw,noexec,nosuid',
    '--env', 'POSTGRES_USER=supabase_admin',
    '--env', "POSTGRES_PASSWORD=$containerPassword",
    '--env', 'POSTGRES_DB=postgres',
    $image
  )
  & docker @containerArguments | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL disposable lokal tidak dapat dimulai.' }
  $containerStarted = $true

  $databaseReady = $false
  for ($attempt = 0; $attempt -lt 120; $attempt++) {
    & docker exec $containerName pg_isready --username supabase_admin --dbname postgres 2>$null | Out-Null
    $acceptingConnections = $LASTEXITCODE -eq 0
    $initialized = Test-ContainerInitialized $containerName
    if ($acceptingConnections -and $initialized) {
      $databaseReady = $true
      break
    }
    Start-Sleep -Seconds 1
  }
  if (-not $databaseReady) {
    throw 'PostgreSQL disposable tidak selesai inisialisasi dalam 120 detik.'
  }
  $credentialStart = New-ProcessStartInfo $dockerPath @(
    'exec', '--interactive', $containerName, 'sh', '-c',
    'umask 077; cat > /run/ale-backup/pgpass.conf; chmod 600 /run/ale-backup/pgpass.conf'
  ) $true $false
  $credentialProcess = New-Object Diagnostics.Process
  $credentialProcess.StartInfo = $credentialStart
  if (-not $credentialProcess.Start()) {
    throw 'Credential passfile sementara tidak dapat dimulai di container disposable.'
  }
  $credentialBytes = [Text.Encoding]::UTF8.GetBytes("$pgPassLine`n")
  $credentialError = $null
  try {
    $credentialProcess.StandardInput.BaseStream.Write($credentialBytes, 0, $credentialBytes.Length)
  } catch {
    $credentialError = $_
  } finally {
    $credentialProcess.StandardInput.Close()
    [Array]::Clear($credentialBytes, 0, $credentialBytes.Length)
  }
  $credentialProcess.WaitForExit()
  $credentialExitCode = $credentialProcess.ExitCode
  $credentialProcess.Dispose()
  $pgPassLine = $null
  if ($credentialError) { throw $credentialError }
  if ($credentialExitCode -ne 0) { throw 'Credential passfile sementara tidak dapat dibuat di tmpfs.' }

  $timestamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')
  $encryptedPath = Join-Path $backupRoot "$($targetSlug)-$timestamp-$([Guid]::NewGuid().ToString('N')).aeb"
  $nodePath = (Get-Command node).Source

  $dumpStart = New-ProcessStartInfo $dockerPath @(
    'exec', '--env', 'PGPASSFILE=/run/ale-backup/pgpass.conf', $containerName,
    'pg_dump', '--format=custom', '--no-owner', '--no-acl', '--no-password',
    '--dbname', $safeConnectionString
  ) $false $true
  $dumpProcess = New-Object Diagnostics.Process
  $dumpProcess.StartInfo = $dumpStart

  $encryptStart = New-ProcessStartInfo $nodePath @(
    (Join-Path $PSScriptRoot 'encryptedBackup.mjs'), 'encrypt-stdin', $encryptedPath
  ) $true $false
  $encryptStart.EnvironmentVariables['BACKUP_ENCRYPTION_KEY'] = $backupKey
  $encryptProcess = New-Object Diagnostics.Process
  $encryptProcess.StartInfo = $encryptStart

  if (-not $encryptProcess.Start()) { throw 'Proses enkripsi tidak dapat dimulai.' }
  if (-not $dumpProcess.Start()) {
    $encryptProcess.StandardInput.Close()
    $encryptProcess.WaitForExit()
    $encryptProcess.Dispose()
    throw 'pg_dump tidak dapat dimulai.'
  }
  try {
    Copy-ProcessOutput $dumpProcess $encryptProcess
  } finally {
    $dumpProcess.Dispose()
    $encryptProcess.Dispose()
  }

  if (-not (Test-Path -LiteralPath $encryptedPath) -or
      (Get-Item -LiteralPath $encryptedPath).Length -le 25) {
    throw 'Artefak backup terenkripsi tidak valid atau kosong.'
  }

  & docker exec --env "PGPASSWORD=$containerPassword" $containerName `
    psql --username supabase_admin --dbname postgres `
    --command 'CREATE DATABASE backup_restore_validation' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Database restore disposable tidak dapat dibuat.' }

  $restoreStart = New-ProcessStartInfo $dockerPath @(
    'exec', '--interactive', '--env', "PGPASSWORD=$containerPassword", $containerName,
    'pg_restore', '--exit-on-error', '--no-owner', '--no-acl',
    '--username', 'supabase_admin', '--dbname', 'backup_restore_validation'
  ) $true $false
  $restoreProcess = New-Object Diagnostics.Process
  $restoreProcess.StartInfo = $restoreStart

  $decryptStart = New-ProcessStartInfo $nodePath @(
    (Join-Path $PSScriptRoot 'encryptedBackup.mjs'), 'decrypt-stdout', $encryptedPath
  ) $false $true
  $decryptStart.EnvironmentVariables['BACKUP_ENCRYPTION_KEY'] = $backupKey
  $decryptProcess = New-Object Diagnostics.Process
  $decryptProcess.StartInfo = $decryptStart

  if (-not $restoreProcess.Start()) { throw 'pg_restore tidak dapat dimulai.' }
  if (-not $decryptProcess.Start()) {
    $restoreProcess.StandardInput.Close()
    $restoreProcess.WaitForExit()
    $restoreProcess.Dispose()
    throw 'Proses dekripsi tidak dapat dimulai.'
  }
  try {
    Copy-ProcessOutput $decryptProcess $restoreProcess
  } finally {
    $decryptProcess.Dispose()
    $restoreProcess.Dispose()
  }

  $tableCount = & docker exec --env "PGPASSWORD=$containerPassword" $containerName `
    psql --username supabase_admin --dbname backup_restore_validation `
    --tuples-only --no-align `
    --command "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')"
  if ($LASTEXITCODE -ne 0) { throw 'Pemeriksaan tabel hasil restore gagal.' }
  if ([int]($tableCount | Select-Object -Last 1) -lt 1) {
    throw 'Restore selesai tetapi tidak menemukan tabel pengguna.'
  }

  Write-Host "Backup $Target terenkripsi tersimpan: $encryptedPath"
  Write-Host "Restore lokal disposable berhasil; tabel pengguna dipulihkan: $($tableCount | Select-Object -Last 1)"
  Write-Host 'Dump plaintext dialirkan; data restore berada di database tmpfs disposable.'
} catch {
  Write-Error $_
  if ($encryptedPath -and (Test-Path -LiteralPath $encryptedPath)) {
    Write-Error "Artefak terenkripsi yang perlu diperiksa: $encryptedPath"
  }
  exit 1
} finally {
  if ($containerStarted) {
    & docker stop --time 5 $containerName | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Write-Error "Container disposable perlu dihentikan manual: $containerName"
    }
  }
  $backupKey = $null
  $databasePassword = $null
  $connectionString = $null
  $safeConnectionString = $null
  $pgPassLine = $null
  $containerPassword = $null
  if ($secureUri) { $secureUri.Dispose() }
  if ($secureKey) { $secureKey.Dispose() }
  if ($keyBytes) { [Array]::Clear($keyBytes, 0, $keyBytes.Length) }
}
