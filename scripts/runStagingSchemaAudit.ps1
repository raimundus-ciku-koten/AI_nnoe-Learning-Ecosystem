param(
    [switch]$PromptForConnection
)

$ErrorActionPreference = 'Stop'
$credentialName = 'AinnoeLE:StagingDatabaseUrl'
$projectReference = 'samszhfyhbjuculrcffg'
$native = @'
using System;
using System.Runtime.InteropServices;

public static class AleStagingAuditCredentialStore {
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

    [DllImport("Advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredWrite(ref CREDENTIAL credential, UInt32 flags);

    [DllImport("Advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredRead(string target, UInt32 type, UInt32 flags, out IntPtr credential);

    [DllImport("Advapi32.dll", EntryPoint = "CredFree")]
    public static extern void CredFree(IntPtr credential);
}
'@

Add-Type -TypeDefinition $native

function Read-StagingCredential {
    $pointer = [IntPtr]::Zero
    if (-not [AleStagingAuditCredentialStore]::CredRead($credentialName, 1, 0, [ref]$pointer)) {
        $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
        if ($errorCode -ne 1168) {
            throw "Windows Credential Manager lookup failed (Win32 error $errorCode)."
        }
        return $null
    }

    try {
        $credential = [Runtime.InteropServices.Marshal]::PtrToStructure(
            $pointer,
            [type][AleStagingAuditCredentialStore+CREDENTIAL]
        )
        if ($credential.CredentialBlobSize -lt 1 -or $credential.CredentialBlobSize -gt 5120) {
            throw 'The stored Staging credential has an invalid size.'
        }

        $bytes = New-Object byte[] $credential.CredentialBlobSize
        [Runtime.InteropServices.Marshal]::Copy($credential.CredentialBlob, $bytes, 0, $bytes.Length)
        try {
            return [Text.Encoding]::UTF8.GetString($bytes)
        }
        finally {
            [Array]::Clear($bytes, 0, $bytes.Length)
        }
    }
    finally {
        [AleStagingAuditCredentialStore]::CredFree($pointer)
    }
}

function Assert-StagingUri([string]$Value) {
    $uri = $null
    if (-not [Uri]::TryCreate($Value, [UriKind]::Absolute, [ref]$uri)) {
        throw 'Enter a valid PostgreSQL URI for the Staging database.'
    }
    $userInfo = $uri.UserInfo.Split(':', 2)
    if ($uri.Scheme -notin @('postgres', 'postgresql') `
        -or $userInfo.Length -ne 2 `
        -or -not $userInfo[1] `
        -or -not $uri.AbsolutePath.Trim('/')) {
        throw 'The Staging PostgreSQL URI must include a scheme, password, and database name.'
    }

    $username = [Uri]::UnescapeDataString($userInfo[0])
    $directStaging = $uri.Host -eq "db.$projectReference.supabase.co" -and $username -eq 'postgres'
    $poolerStaging = $uri.Host -match '^aws-\d+-ap-south-1\.pooler\.supabase\.com$' `
        -and $username -eq "postgres.$projectReference"
    if (-not ($directStaging -or $poolerStaging)) {
        throw 'The PostgreSQL URI must target the approved Staging project only.'
    }
    if ($Value -match 'YOUR-PASSWORD|YOUR_PASSWORD|\[.*PASSWORD.*\]|<.*PASSWORD.*>') {
        throw 'Replace the database password placeholder before saving the Staging URI.'
    }
}

function Save-StagingCredential([string]$Value) {
    $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
    if ($bytes.Length -gt 5120) {
        [Array]::Clear($bytes, 0, $bytes.Length)
        throw 'The Staging URI exceeds the Windows Credential Manager size limit.'
    }

    $targetPointer = [IntPtr]::Zero
    $userNamePointer = [IntPtr]::Zero
    $blobPointer = [IntPtr]::Zero
    try {
        $targetPointer = [Runtime.InteropServices.Marshal]::StringToHGlobalUni($credentialName)
        $userNamePointer = [Runtime.InteropServices.Marshal]::StringToHGlobalUni('Supabase Staging PostgreSQL URI')
        $blobPointer = [Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
        [Runtime.InteropServices.Marshal]::Copy($bytes, 0, $blobPointer, $bytes.Length)

        $credential = New-Object AleStagingAuditCredentialStore+CREDENTIAL
        $credential.Type = 1
        $credential.TargetName = $targetPointer
        $credential.UserName = $userNamePointer
        $credential.CredentialBlobSize = [uint32]$bytes.Length
        $credential.CredentialBlob = $blobPointer
        $credential.Persist = 2
        if (-not [AleStagingAuditCredentialStore]::CredWrite([ref]$credential, 0)) {
            $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
            throw "Windows Credential Manager could not save the Staging URI (Win32 error $errorCode)."
        }
    }
    finally {
        if ($blobPointer -ne [IntPtr]::Zero) {
            $zeroes = New-Object byte[] $bytes.Length
            [Runtime.InteropServices.Marshal]::Copy($zeroes, 0, $blobPointer, $zeroes.Length)
            [Runtime.InteropServices.Marshal]::FreeHGlobal($blobPointer)
            [Array]::Clear($zeroes, 0, $zeroes.Length)
        }
        if ($targetPointer -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::FreeHGlobal($targetPointer)
        }
        if ($userNamePointer -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::FreeHGlobal($userNamePointer)
        }
        [Array]::Clear($bytes, 0, $bytes.Length)
    }
}

$connectionUri = $null
$inputBox = $null
$enteredConnection = $false
$previousDatabaseUrl = $env:SUPABASE_DB_URL
try {
    if (-not $PromptForConnection) {
        $connectionUri = Read-StagingCredential
    }
    if (-not $connectionUri) {
        $null = Add-Type -AssemblyName System.Windows.Forms
        $null = Add-Type -AssemblyName System.Drawing
        $form = New-Object System.Windows.Forms.Form
        $form.Text = 'Save Staging audit connection securely'
        $form.StartPosition = 'CenterScreen'
        $form.FormBorderStyle = 'FixedDialog'
        $form.ClientSize = New-Object System.Drawing.Size(520, 150)
        $form.MaximizeBox = $false
        $form.MinimizeBox = $false
        $form.TopMost = $true

        $label = New-Object System.Windows.Forms.Label
        $label.Text = 'Enter the Staging PostgreSQL URI. It is masked and saved only in Windows Credential Manager; it will not be written to the repository.'
        $label.AutoSize = $false
        $label.Location = New-Object System.Drawing.Point(12, 12)
        $label.Size = New-Object System.Drawing.Size(496, 42)

        $inputBox = New-Object System.Windows.Forms.TextBox
        $inputBox.UseSystemPasswordChar = $true
        $inputBox.Location = New-Object System.Drawing.Point(12, 58)
        $inputBox.Size = New-Object System.Drawing.Size(496, 24)

        $saveButton = New-Object System.Windows.Forms.Button
        $saveButton.Text = 'Validate and save'
        $saveButton.DialogResult = [System.Windows.Forms.DialogResult]::OK
        $saveButton.Location = New-Object System.Drawing.Point(292, 102)
        $saveButton.Size = New-Object System.Drawing.Size(124, 30)

        $cancelButton = New-Object System.Windows.Forms.Button
        $cancelButton.Text = 'Cancel'
        $cancelButton.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
        $cancelButton.Location = New-Object System.Drawing.Point(424, 102)
        $cancelButton.Size = New-Object System.Drawing.Size(84, 30)

        $form.Controls.AddRange(@($label, $inputBox, $saveButton, $cancelButton))
        $form.AcceptButton = $saveButton
        $form.CancelButton = $cancelButton
        try {
            if ($form.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
                throw 'Staging credential entry was cancelled.'
            }
            $connectionUri = $inputBox.Text
            $enteredConnection = $true
        }
        finally {
            $inputBox.Clear()
            $form.Dispose()
        }

        Assert-StagingUri $connectionUri
    }

    Assert-StagingUri $connectionUri
    $env:SUPABASE_DB_URL = $connectionUri
    & node (Join-Path $PSScriptRoot 'auditStagingSchema.mjs')
    if ($LASTEXITCODE -ne 0) {
        throw "Read-only Staging schema audit failed (Node exit $LASTEXITCODE)."
    }
    if ($enteredConnection) {
        Save-StagingCredential $connectionUri
    }
}
finally {
    $env:SUPABASE_DB_URL = $previousDatabaseUrl
    $connectionUri = $null
    $previousDatabaseUrl = $null
}
$PromptForConnection
$PromptForConnection
