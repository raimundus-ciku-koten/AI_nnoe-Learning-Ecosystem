param(
    [string]$DestinationDirectory = (Join-Path $env:LOCALAPPDATA 'AinnoeLE\ProductionBackups')
)

$ErrorActionPreference = 'Stop'
$projectReference = 'jvcrmzmuxgyuetkjqady'
$uriCredentialName = 'AinnoeLE:ProductionDatabaseUrl'
$keyCredentialName = 'AinnoeLE:ProductionBackupEncryptionKey'
$postgresBin = Join-Path $env:LOCALAPPDATA 'Programs\PostgreSQL\17\bin'
$native = @'
using System;
using System.Runtime.InteropServices;

public static class AleBackupCredentialStore {
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

function Read-LocalCredential([string]$Target) {
    $pointer = [IntPtr]::Zero
    if (-not [AleBackupCredentialStore]::CredRead($Target, 1, 0, [ref]$pointer)) {
        $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
        throw "Required local Windows Credential Manager entry is unavailable (Win32 error $errorCode)."
    }

    try {
        $credential = [Runtime.InteropServices.Marshal]::PtrToStructure(
            $pointer,
            [type][AleBackupCredentialStore+CREDENTIAL]
        )
        if ($credential.CredentialBlobSize -lt 1 -or $credential.CredentialBlobSize -gt 5120) {
            throw 'A required local credential has an invalid stored size.'
        }

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
        [AleBackupCredentialStore]::CredFree($pointer)
    }
}

function Set-PrivateDirectory([string]$Path) {
    [void][IO.Directory]::CreateDirectory($Path)
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $allowedSids = @(
        $currentUser.Value,
        'S-1-5-18',
        'S-1-5-32-544',
        'S-1-3-0'
    )
    $acl = Get-Acl -LiteralPath $Path
    $currentUserHasFullControl = $false
    foreach ($rule in $acl.Access) {
        $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
        if ($sid -notin $allowedSids) {
            throw 'The local backup directory has access granted to an unexpected account. Choose a private folder and review its Windows permissions.'
        }
        if ($sid -eq $currentUser.Value `
            -and $rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow `
            -and $rule.FileSystemRights.ToString() -match 'FullControl') {
            $currentUserHasFullControl = $true
        }
    }
    if (-not $currentUserHasFullControl) {
        throw 'The current Windows user does not have full control of the local backup directory.'
    }
}

$requiredExecutables = @('pg_dump.exe', 'pg_restore.exe', 'initdb.exe', 'pg_ctl.exe', 'psql.exe')
foreach ($executable in $requiredExecutables) {
    if (-not (Test-Path -LiteralPath (Join-Path $postgresBin $executable) -PathType Leaf)) {
        throw "Required PostgreSQL 17 utility is not installed: $executable."
    }
}

$freeSpace = (Get-PSDrive -Name ([IO.Path]::GetPathRoot($DestinationDirectory).Substring(0, 1))).Free
if ($freeSpace -lt 2GB) {
    throw 'At least 2 GB of free disk space is required for a safe backup and restore test.'
}

$connectionString = $null
$backupKey = $null
$connectionUri = $null
$passwordFile = $null
$workDirectory = $null
$plainDump = $null
$verifiedDump = $null
$encryptedArtifact = $null
$serverStarted = $false
$databaseDirectory = $null
$nativeBlobPointer = [IntPtr]::Zero
$nativeBlobLength = 0
$pgPassBytes = $null
$encryptedArtifactCreated = $false

try {
    $connectionString = Read-LocalCredential $uriCredentialName
    $backupKey = Read-LocalCredential $keyCredentialName

    if ($connectionString -notmatch '^postgres(?:ql)?://') {
        throw 'The stored Production database credential is not a PostgreSQL URI.'
    }
    if ($backupKey -notmatch '^[A-Za-z0-9+/]{43}=$') {
        throw 'The stored backup encryption key is not valid base64 for 32 bytes.'
    }

    $keyBytes = [Convert]::FromBase64String($backupKey)
    if ($keyBytes.Length -ne 32 -or [Convert]::ToBase64String($keyBytes) -cne $backupKey) {
        throw 'The stored backup encryption key failed 32-byte validation.'
    }
    [Array]::Clear($keyBytes, 0, $keyBytes.Length)

    $connectionUri = [Uri]$connectionString
    $userInfo = [Uri]::UnescapeDataString($connectionUri.UserInfo)
    $separator = $userInfo.IndexOf(':')
    if ($separator -lt 1 -or $separator -eq ($userInfo.Length - 1)) {
        throw 'The stored Production URI must include a PostgreSQL username and password.'
    }
    $dbUser = $userInfo.Substring(0, $separator)
    $dbPassword = $userInfo.Substring($separator + 1)
    if ($dbPassword -match 'YOUR-PASSWORD|YOUR_PASSWORD|\[.*PASSWORD.*\]|<.*PASSWORD.*>') {
        throw 'The stored Production URI still contains a password placeholder. Replace it with the actual database password from Supabase.'
    }

    $hostMatchesProject = $connectionUri.Host -eq "db.$projectReference.supabase.co" `
        -or $dbUser.EndsWith(".$projectReference", [StringComparison]::OrdinalIgnoreCase)
    if (-not $hostMatchesProject) {
        throw 'The stored PostgreSQL URI does not match the confirmed Production project reference.'
    }
    if (-not $connectionUri.AbsolutePath.Trim('/')) {
        throw 'The stored PostgreSQL URI does not identify a database.'
    }

    $directory = [IO.Path]::GetFullPath($DestinationDirectory)
    Set-PrivateDirectory $directory
    $timestamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')
    $encryptedArtifact = Join-Path $directory "ainnoe-production-$timestamp.dump.aeb"
    if (Test-Path -LiteralPath $encryptedArtifact) {
        throw 'The encrypted backup destination already exists; refusing to overwrite it.'
    }

    $workDirectory = Join-Path $env:LOCALAPPDATA ('AinnoeLE\BackupWork\' + [guid]::NewGuid().ToString('N'))
    Set-PrivateDirectory $workDirectory
    $plainDump = Join-Path $workDirectory 'production.dump'
    $verifiedDump = Join-Path $workDirectory 'verified.dump'
    $passwordFile = Join-Path $workDirectory 'pgpass.conf'

    $escapedPassword = $dbPassword.Replace('\', '\\').Replace(':', '\:')
    $escapedUser = $dbUser.Replace('\', '\\').Replace(':', '\:')
    $escapedDatabase = $connectionUri.AbsolutePath.Trim('/').Replace('\', '\\').Replace(':', '\:')
    $pgPassLine = '{0}:{1}:{2}:{3}:{4}' -f $connectionUri.Host, $connectionUri.Port, `
        $escapedDatabase, $escapedUser, $escapedPassword
    $pgPassBytes = [Text.Encoding]::UTF8.GetBytes($pgPassLine)
    $nativeBlobLength = $pgPassBytes.Length
    $nativeBlobPointer = [Runtime.InteropServices.Marshal]::AllocHGlobal($pgPassBytes.Length)
    [Runtime.InteropServices.Marshal]::Copy($pgPassBytes, 0, $nativeBlobPointer, $pgPassBytes.Length)
    [IO.File]::WriteAllBytes($passwordFile, $pgPassBytes)
    [Array]::Clear($pgPassBytes, 0, $pgPassBytes.Length)
    $pgPassBytes = $null
    Set-PrivateDirectory $workDirectory

    $dumpArguments = @(
        '--format=custom', '--no-owner', '--no-acl', '--no-password',
        '--host', $connectionUri.Host, '--port', $connectionUri.Port,
        '--username', $dbUser, '--dbname', $connectionUri.AbsolutePath.Trim('/'),
        '--file', $plainDump
    )
    $env:PGPASSFILE = $passwordFile
    $env:PGSSLMODE = 'require'
    & (Join-Path $postgresBin 'pg_dump.exe') @dumpArguments
    if ($LASTEXITCODE -ne 0) {
        throw 'Production pg_dump failed. No plaintext backup is retained.'
    }
    if (-not (Test-Path -LiteralPath $plainDump) -or (Get-Item -LiteralPath $plainDump).Length -lt 1) {
        throw 'Production pg_dump returned without creating a non-empty backup.'
    }

    $env:BACKUP_ENCRYPTION_KEY = $backupKey
    $encryptedScript = Join-Path $PSScriptRoot 'encryptedBackup.mjs'
    & node $encryptedScript encrypt $plainDump $encryptedArtifact
    if ($LASTEXITCODE -ne 0) {
        throw 'Production dump encryption failed.'
    }
    $encryptedArtifactCreated = $true
    Remove-Item -LiteralPath $plainDump -Force
    $plainDump = $null
    Remove-Item -LiteralPath $passwordFile -Force
    $passwordFile = $null
    $env:PGPASSFILE = $null
    $env:PGSSLMODE = $null

    & node $encryptedScript decrypt $encryptedArtifact $verifiedDump
    if ($LASTEXITCODE -ne 0) {
        throw 'Encrypted Production backup authentication/decryption verification failed.'
    }
    & (Join-Path $postgresBin 'pg_restore.exe') '--list' $verifiedDump *> $null
    if ($LASTEXITCODE -ne 0) {
        throw 'The decrypted Production backup is not a readable PostgreSQL custom-format archive.'
    }

    $restoreToc = Join-Path $workDirectory 'restore.toc'
    $restoreEntries = & (Join-Path $postgresBin 'pg_restore.exe') '--list' $verifiedDump
    if ($LASTEXITCODE -ne 0) {
        throw 'Could not inspect the encrypted Production backup restore manifest.'
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
        if (-not (Test-Path -LiteralPath $restoreToc) -or (Get-Item -LiteralPath $restoreToc).Length -lt 1) {
            throw 'Could not create a valid restore manifest excluding the unavailable Supabase Vault extension.'
        }
    }

    $portProbe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    $portProbe.Start()
    $restorePort = $portProbe.LocalEndpoint.Port
    $portProbe.Stop()

    $databaseDirectory = Join-Path $workDirectory 'restore-data'
    $initdbLog = Join-Path $workDirectory 'initdb.log'
    $serverLog = Join-Path $workDirectory 'restore-server.log'
    $restoreLog = Join-Path $workDirectory 'restore.log'
    & (Join-Path $postgresBin 'initdb.exe') -D $databaseDirectory `
        --username=postgres --encoding=UTF8 --no-locale `
        --auth-local=trust --auth-host=trust *> $initdbLog
    if ($LASTEXITCODE -ne 0) {
        throw 'Could not initialize an isolated local restore database.'
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
    & (Join-Path $postgresBin 'psql.exe') -X -w --host=127.0.0.1 `
        "--port=$restorePort" --username=postgres --dbname=postgres `
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
        throw "Restore validation failed. Encrypted backup retained at $encryptedArtifact; plaintext working files will be removed."
    }

    $verification = & (Join-Path $postgresBin 'psql.exe') -X -w `
        --host=127.0.0.1 "--port=$restorePort" --username=postgres `
        --dbname=production_restore_validation --set=ON_ERROR_STOP=1 `
        --tuples-only --no-align --command="SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND c.relkind IN ('r', 'p');"
    if ($LASTEXITCODE -ne 0 -or $verification -notmatch '^\s*\d+\s*$') {
        throw "Restored database verification query failed. Encrypted backup retained at $encryptedArtifact."
    }

    $encryptedLength = (Get-Item -LiteralPath $encryptedArtifact).Length
    "Production backup encrypted and restored successfully. Artifact: $encryptedArtifact"
    "Encrypted size: $encryptedLength bytes. Restored user-table count: $($verification.Trim())."
    if ($vaultEntriesToExclude.Count -gt 0) {
        'The local restore excluded the unavailable supabase_vault extension and its Vault secrets data; both remain preserved inside the authenticated encrypted backup artifact.'
    }
}
catch {
    if ($encryptedArtifactCreated) {
        Write-Error "$($_.Exception.Message) Encrypted backup artifact retained at $encryptedArtifact."
    }
    else {
        throw
    }
}
finally {
    $serverStopFailed = $false
    $temporaryCleanupFailed = $false
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
        foreach ($temporaryPath in @($passwordFile, $plainDump, $verifiedDump)) {
            if ($temporaryPath -and (Test-Path -LiteralPath $temporaryPath)) {
                Remove-Item -LiteralPath $temporaryPath -Force
            }
        }
        if ($workDirectory -and (Test-Path -LiteralPath $workDirectory)) {
            Remove-Item -LiteralPath $workDirectory -Recurse -Force
        }
    }
    catch {
        [Console]::Error.WriteLine('Temporary backup files could not be fully removed; inspect the restricted local work directory.')
        $temporaryCleanupFailed = $true
    }

    if ($nativeBlobPointer -ne [IntPtr]::Zero) {
        $pgPassClear = New-Object byte[] $nativeBlobLength
        [Runtime.InteropServices.Marshal]::Copy(
            $pgPassClear,
            0,
            $nativeBlobPointer,
            $pgPassClear.Length
        )
        [Array]::Clear($pgPassClear, 0, $pgPassClear.Length)
        [Runtime.InteropServices.Marshal]::FreeHGlobal($nativeBlobPointer)
    }
    if ($backupKey) {
        $keyClear = [Text.Encoding]::UTF8.GetBytes($backupKey)
        [Array]::Clear($keyClear, 0, $keyClear.Length)
    }
    $dbPassword = $null
    $connectionString = $null
    $backupKey = $null
    $connectionUri = $null
    $userInfo = $null
    $pgPassLine = $null
    $escapedPassword = $null
    $escapedUser = $null
    $env:BACKUP_ENCRYPTION_KEY = $null
    $env:PGPASSFILE = $null
    $env:PGSSLMODE = $null
    if ($temporaryCleanupFailed) {
        throw 'Temporary backup data cleanup was incomplete.'
    }
    if ($serverStopFailed) {
        throw 'The disposable local PostgreSQL server could not be stopped cleanly.'
    }
}
