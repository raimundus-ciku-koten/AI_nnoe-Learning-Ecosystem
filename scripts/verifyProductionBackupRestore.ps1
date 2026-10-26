param(
    [string]$ArtifactPath
)

$ErrorActionPreference = 'Stop'
$backupDirectory = [IO.Path]::GetFullPath(
    (Join-Path $env:LOCALAPPDATA 'AinnoeLE\ProductionBackups')
)
$keyCredentialName = 'AinnoeLE:ProductionBackupEncryptionKey'
$postgresBin = Join-Path $env:LOCALAPPDATA 'Programs\PostgreSQL\17\bin'
$native = @'
using System;
using System.Runtime.InteropServices;

public static class AleRestoreCredentialStore {
    [StructLayout(LayoutKind.Sequential)]
    public struct FILETIME {
        public UInt32 Low;
        public UInt32 High;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct CREDENTIAL {
        public UInt32 Flags;
        public UInt32 Type;
        public IntPtr TargetName;
        public IntPtr Comment;
        public FILETIME LastWritten;
        public UInt32 CredentialBlobSize;
        public IntPtr CredentialBlob;
        public UInt32 Persist;
        public UInt32 AttributeCount;
        public IntPtr Attributes;
        public IntPtr TargetAlias;
        public IntPtr UserName;
    }

    [DllImport("Advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredRead(string target, UInt32 type, UInt32 flags, out IntPtr credential);

    [DllImport("Advapi32.dll", EntryPoint = "CredFree")]
    public static extern void CredFree(IntPtr credential);
}
'@

Add-Type -TypeDefinition $native

function Read-BackupKey {
    $pointer = [IntPtr]::Zero
    if (-not [AleRestoreCredentialStore]::CredRead($keyCredentialName, 1, 0, [ref]$pointer)) {
        $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
        throw "The local backup encryption key is unavailable (Win32 error $errorCode)."
    }

    try {
        $credential = [Runtime.InteropServices.Marshal]::PtrToStructure(
            $pointer,
            [type][AleRestoreCredentialStore+CREDENTIAL]
        )
        $bytes = New-Object byte[] $credential.CredentialBlobSize
        [Runtime.InteropServices.Marshal]::Copy($credential.CredentialBlob, $bytes, 0, $bytes.Length)
        try {
            [Text.Encoding]::UTF8.GetString($bytes)
        }
        finally {
            [Array]::Clear($bytes, 0, $bytes.Length)
        }
    }
    finally {
        [AleRestoreCredentialStore]::CredFree($pointer)
    }
}

function Assert-PrivateDirectory([string]$Path) {
    [void][IO.Directory]::CreateDirectory($Path)
    $allowedSids = @(
        [Security.Principal.WindowsIdentity]::GetCurrent().User.Value,
        'S-1-5-18',
        'S-1-5-32-544',
        'S-1-3-0'
    )
    $acl = Get-Acl -LiteralPath $Path
    $currentUserHasFullControl = $false
    foreach ($rule in $acl.Access) {
        $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
        if ($sid -notin $allowedSids) {
            throw 'The local restore directory has access granted to an unexpected account.'
        }
        if ($sid -eq [Security.Principal.WindowsIdentity]::GetCurrent().User.Value `
            -and $rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow `
            -and $rule.FileSystemRights.ToString() -match 'FullControl') {
            $currentUserHasFullControl = $true
        }
    }
    if (-not $currentUserHasFullControl) {
        throw 'The current Windows user does not have full control of the local restore directory.'
    }
}

if (-not $ArtifactPath) {
    $latestArtifact = Get-ChildItem -LiteralPath $backupDirectory -Filter 'ainnoe-production-*.dump.aeb' `
        -File -ErrorAction Stop | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
    if (-not $latestArtifact) {
        throw 'No encrypted Production backup artifact was found in the protected backup directory.'
    }
    $ArtifactPath = $latestArtifact.FullName
}

$artifact = (Resolve-Path -LiteralPath $ArtifactPath).Path
if (-not $artifact.StartsWith($backupDirectory + '\', [StringComparison]::OrdinalIgnoreCase) `
    -or [IO.Path]::GetFileName($artifact) -notmatch '^ainnoe-production-[0-9]{8}-[0-9]{6}\.dump\.aeb$') {
    throw 'Only a named Production backup artifact in the protected local backup directory can be restored.'
}
if ((Get-Item -LiteralPath $artifact).Length -lt 38) {
    throw 'The encrypted Production backup artifact is too small to be valid.'
}

foreach ($executable in @('pg_restore.exe', 'initdb.exe', 'pg_ctl.exe', 'psql.exe', 'postgres.exe')) {
    if (-not (Test-Path -LiteralPath (Join-Path $postgresBin $executable) -PathType Leaf)) {
        throw "Required PostgreSQL 17 restore utility is unavailable: $executable."
    }
}
if ((Get-PSDrive -Name ([IO.Path]::GetPathRoot($backupDirectory).Substring(0, 1))).Free -lt 2GB) {
    throw 'At least 2 GB of free disk space is required for a safe restore test.'
}

$backupKey = $null
$workDirectory = $null
$verifiedDump = $null
$databaseDirectory = $null
$serverStarted = $false
$serverStopFailed = $false
$temporaryCleanupFailed = $false

try {
    $backupKey = Read-BackupKey
    if ($backupKey -notmatch '^[A-Za-z0-9+/]{43}=$') {
        throw 'The stored backup encryption key is not valid base64 for 32 bytes.'
    }
    $keyBytes = [Convert]::FromBase64String($backupKey)
    if ($keyBytes.Length -ne 32 -or [Convert]::ToBase64String($keyBytes) -cne $backupKey) {
        throw 'The stored backup encryption key failed 32-byte validation.'
    }
    [Array]::Clear($keyBytes, 0, $keyBytes.Length)

    $workRoot = Join-Path $env:LOCALAPPDATA 'AinnoeLE\BackupWork'
    [void][IO.Directory]::CreateDirectory($workRoot)
    $workDirectory = Join-Path $workRoot ([guid]::NewGuid().ToString('N'))
    Assert-PrivateDirectory $workDirectory
    $verifiedDump = Join-Path $workDirectory 'verified.dump'
    $serverLog = Join-Path $workDirectory 'restore-server.log'
    $initdbLog = Join-Path $workDirectory 'initdb.log'
    $restoreLog = Join-Path $workDirectory 'restore.log'
    $restoreToc = Join-Path $workDirectory 'restore.toc'

    $env:BACKUP_ENCRYPTION_KEY = $backupKey
    $encryptedScript = Join-Path $PSScriptRoot 'encryptedBackup.mjs'
    & node $encryptedScript decrypt $artifact $verifiedDump
    if ($LASTEXITCODE -ne 0) {
        throw 'Encrypted Production backup authentication/decryption failed.'
    }
    $env:BACKUP_ENCRYPTION_KEY = $null

    $restoreEntries = & (Join-Path $postgresBin 'pg_restore.exe') '--list' $verifiedDump
    if ($LASTEXITCODE -ne 0) {
        throw 'The decrypted backup is not a readable PostgreSQL custom-format archive.'
    }
    $vaultEntriesToExclude = @(
        $restoreEntries | Where-Object {
            $_ -match '\sEXTENSION\s-\ssupabase_vault\s*$' `
                -or $_ -match '\sCOMMENT\s-\sEXTENSION\ssupabase_vault\s*$' `
                -or $_ -match '\sTABLE\sDATA\svault\ssecrets(?:\s|$)'
        }
    )
    if ($vaultEntriesToExclude.Count -gt 0) {
        $restoreEntries |
            Where-Object {
                $_ -notmatch '\sEXTENSION\s-\ssupabase_vault\s*$' `
                    -and $_ -notmatch '\sCOMMENT\s-\sEXTENSION\ssupabase_vault\s*$' `
                    -and $_ -notmatch '\sTABLE\sDATA\svault\ssecrets(?:\s|$)'
            } |
            Set-Content -LiteralPath $restoreToc -Encoding Ascii
    }

    $portProbe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    $portProbe.Start()
    $restorePort = $portProbe.LocalEndpoint.Port
    $portProbe.Stop()

    $databaseDirectory = Join-Path $workDirectory 'restore-data'
    & (Join-Path $postgresBin 'initdb.exe') -D $databaseDirectory `
        --username=postgres --encoding=UTF8 --no-locale `
        --auth-local=trust --auth-host=trust *> $initdbLog
    if ($LASTEXITCODE -ne 0) {
        throw 'Could not initialize the isolated local restore database.'
    }

    & (Join-Path $postgresBin 'pg_ctl.exe') -D $databaseDirectory -l $serverLog `
        -o "-h 127.0.0.1 -p $restorePort" -w start
    if ($LASTEXITCODE -ne 0) {
        throw 'Could not start the loopback-only disposable restore database.'
    }
    $serverStarted = $true

    & (Join-Path $postgresBin 'psql.exe') -X -w --host=127.0.0.1 `
        "--port=$restorePort" --username=postgres --dbname=postgres `
        --set=ON_ERROR_STOP=1 --command='CREATE DATABASE production_restore_validation;'
    if ($LASTEXITCODE -ne 0) {
        throw 'Could not create the disposable restore-validation database.'
    }

    $bootstrapSql = @'
DO $$
DECLARE
    role_name text;
BEGIN
    FOREACH role_name IN ARRAY ARRAY[
        'anon',
        'authenticated',
        'service_role',
        'authenticator',
        'supabase_admin',
        'supabase_auth_admin',
        'supabase_storage_admin',
        'supabase_functions_admin',
        'supabase_replication_admin',
        'supabase_read_only_user',
        'supabase_realtime_admin',
        'supabase_etl_admin',
        'supabase_s3_admin',
        'supabase_buckets_admin',
        'supabase_vault_admin',
        'supabase_graphql_admin',
        'dashboard_user',
        'pgbouncer'
    ]
    LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = role_name) THEN
            EXECUTE format('CREATE ROLE %I NOLOGIN', role_name);
        END IF;
    END LOOP;
END
$$;
'@
    & (Join-Path $postgresBin 'psql.exe') -X -w `
        --host=127.0.0.1 "--port=$restorePort" --username=postgres --dbname=postgres `
        --set=ON_ERROR_STOP=1 --command=$bootstrapSql
    if ($LASTEXITCODE -ne 0) {
        throw 'Could not create the standard non-login Supabase roles for local restore validation.'
    }

    $restoreArguments = @(
        '--exit-on-error',
        '--no-owner',
        '--no-acl',
        '--host=127.0.0.1',
        "--port=$restorePort",
        '--username=postgres',
        '--dbname=production_restore_validation'
    )
    if ($vaultEntriesToExclude.Count -gt 0) {
        $restoreArguments += @('--use-list', $restoreToc)
    }
    $restoreArguments += $verifiedDump
    & (Join-Path $postgresBin 'pg_restore.exe') @restoreArguments *> $restoreLog
    if ($LASTEXITCODE -ne 0) {
        throw "Restore validation failed. The encrypted artifact remains at $artifact."
    }

    $verification = & (Join-Path $postgresBin 'psql.exe') -X -w `
        --host=127.0.0.1 "--port=$restorePort" --username=postgres `
        --dbname=production_restore_validation --set=ON_ERROR_STOP=1 `
        --tuples-only --no-align --command="SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND c.relkind IN ('r', 'p');"
    if ($LASTEXITCODE -ne 0 -or $verification -notmatch '^\s*\d+\s*$') {
        throw "Restored database verification query failed. The encrypted artifact remains at $artifact."
    }

    "Encrypted Production backup authenticated and restored successfully."
    "Artifact: $artifact"
    "Restored user-table count: $($verification.Trim())."
    if ($vaultEntriesToExclude.Count -gt 0) {
        'Local restore excluded the unavailable supabase_vault extension and its Vault secrets data; both remain preserved inside the authenticated encrypted backup artifact.'
    }
}
finally {
    if ($serverStarted -and $databaseDirectory) {
        try {
            & (Join-Path $postgresBin 'pg_ctl.exe') -D $databaseDirectory -m fast -w stop *> $null
            $serverStopFailed = $LASTEXITCODE -ne 0
        }
        catch {
            $serverStopFailed = $true
        }
    }

    try {
        if ($workDirectory -and (Test-Path -LiteralPath $workDirectory)) {
            Remove-Item -LiteralPath $workDirectory -Recurse -Force
        }
    }
    catch {
        [Console]::Error.WriteLine('Temporary restore files could not be fully removed; inspect the restricted local work directory.')
        $temporaryCleanupFailed = $true
    }

    $env:BACKUP_ENCRYPTION_KEY = $null
    if ($backupKey) {
        $keyBytes = [Text.Encoding]::UTF8.GetBytes($backupKey)
        [Array]::Clear($keyBytes, 0, $keyBytes.Length)
    }
    $backupKey = $null

    if ($temporaryCleanupFailed) {
        throw 'Temporary restore data cleanup was incomplete.'
    }
    if ($serverStopFailed) {
        throw 'The disposable local PostgreSQL server could not be stopped cleanly.'
    }
}
