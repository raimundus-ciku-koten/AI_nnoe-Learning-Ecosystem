param(
    [switch]$ReplaceExisting
)

$ErrorActionPreference = 'Stop'

$credentialName = 'AinnoeLE:ProductionDatabaseUrl'
$native = @'
using System;
using System.Runtime.InteropServices;

public static class AleProductionCredentialStore {
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
$null = Add-Type -AssemblyName System.Windows.Forms
$null = Add-Type -AssemblyName System.Drawing

$existing = [IntPtr]::Zero
$hasExisting = [AleProductionCredentialStore]::CredRead($credentialName, 1, 0, [ref]$existing)
if ($hasExisting) {
    [AleProductionCredentialStore]::CredFree($existing)
    if (-not $ReplaceExisting) {
        throw 'A Production database credential is already stored. Use the explicit replacement task to update it.'
    }

    $replace = [System.Windows.Forms.MessageBox]::Show(
        'Replace the existing Production database URI only after the new value passes validation?',
        'Confirm Production credential replacement',
        [System.Windows.Forms.MessageBoxButtons]::YesNo,
        [System.Windows.Forms.MessageBoxIcon]::Warning
    )
    if ($replace -ne [System.Windows.Forms.DialogResult]::Yes) {
        throw 'Credential replacement was cancelled.'
    }
} else {
    $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    if ($errorCode -ne 1168) {
        throw "Windows Credential Manager lookup failed (Win32 error $errorCode)."
    }
}

$form = New-Object System.Windows.Forms.Form
$form.Text = 'Store Production database connection securely'
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.ClientSize = New-Object System.Drawing.Size(520, 150)
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.TopMost = $true

$label = New-Object System.Windows.Forms.Label
$label.Text = 'Paste the complete PostgreSQL URI, or only the Production database password. The value is masked and saved only in Windows Credential Manager.'
$label.AutoSize = $false
$label.Location = New-Object System.Drawing.Point(12, 12)
$label.Size = New-Object System.Drawing.Size(496, 42)

$uriInput = New-Object System.Windows.Forms.TextBox
$uriInput.UseSystemPasswordChar = $true
$uriInput.Location = New-Object System.Drawing.Point(12, 58)
$uriInput.Size = New-Object System.Drawing.Size(496, 24)

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

$form.Controls.AddRange(@($label, $uriInput, $saveButton, $cancelButton))
$form.AcceptButton = $saveButton
$form.CancelButton = $cancelButton

try {
    $dialogResult = $form.ShowDialog()
    if ($dialogResult -ne [System.Windows.Forms.DialogResult]::OK) {
        throw 'Credential entry was cancelled.'
    }
    $connectionUri = $uriInput.Text
}
finally {
    $uriInput.Clear()
    $form.Dispose()
}

$uriPointer = [IntPtr]::Zero
$targetPointer = [IntPtr]::Zero
$userNamePointer = [IntPtr]::Zero
$blobPointer = [IntPtr]::Zero
$uriBytes = $null
$blobBytes = $null
$verifiedBytes = $null
$readBack = [IntPtr]::Zero

try {
    if ($connectionUri -notmatch '^postgres(?:ql)?://') {
        if (-not $connectionUri -or $connectionUri -match 'YOUR-PASSWORD|YOUR_PASSWORD|\[.*PASSWORD.*\]|<.*PASSWORD.*>') {
            throw 'Enter the actual Production database password or the full PostgreSQL URI without a placeholder.'
        }
        $encodedPassword = [Uri]::EscapeDataString($connectionUri)
        $connectionUri = "postgresql://postgres:$encodedPassword@db.jvcrmzmuxgyuetkjqady.supabase.co:5432/postgres?sslmode=require"
    }

    if ($connectionUri -match 'YOUR-PASSWORD|YOUR_PASSWORD|\[.*PASSWORD.*\]|<.*PASSWORD.*>') {
        throw 'The copied Supabase URI still has a password placeholder. Replace it, or paste only the actual database password.'
    }

    $parsedUri = $null
    if (-not [Uri]::TryCreate($connectionUri, [UriKind]::Absolute, [ref]$parsedUri)) {
        throw 'The value is not a valid PostgreSQL URI. Paste only the actual database password, or URL-encode special characters in the full URI.'
    }
    if ($parsedUri.Scheme -notin @('postgres', 'postgresql') -or -not $parsedUri.Host) {
        throw 'The URI is missing its PostgreSQL scheme or host.'
    }
    if (-not $parsedUri.AbsolutePath.Trim('/')) {
        throw 'The URI is missing its database name. Use the Supabase Direct Connection URI or paste only the actual database password.'
    }
    $parsedUserInfo = [Uri]::UnescapeDataString($parsedUri.UserInfo)
    if ($parsedUserInfo -notmatch '^[^:]+:.+$') {
        throw 'The URI is missing a username or password. Paste only the actual database password to have the URI completed safely.'
    }
    if ($parsedUri.Host -ne 'db.jvcrmzmuxgyuetkjqady.supabase.co') {
        throw 'The connection URI must point to the confirmed Production project.'
    }

    if ($parsedUserInfo -match 'YOUR-PASSWORD|YOUR_PASSWORD|\[.*PASSWORD.*\]|<.*PASSWORD.*>') {
        throw 'Replace the URI password placeholder with the actual Production database password.'
    }

    $uriBytes = [Text.Encoding]::UTF8.GetBytes($connectionUri)
    if ($uriBytes.Length -gt 5120) {
        throw 'The connection URI exceeds the Windows Credential Manager size limit.'
    }

    $blobBytes = [Text.Encoding]::UTF8.GetBytes($connectionUri)
    $blobPointer = [Runtime.InteropServices.Marshal]::AllocHGlobal($blobBytes.Length)
    [Runtime.InteropServices.Marshal]::Copy($blobBytes, 0, $blobPointer, $blobBytes.Length)
    $targetPointer = [Runtime.InteropServices.Marshal]::StringToHGlobalUni($credentialName)
    $userNamePointer = [Runtime.InteropServices.Marshal]::StringToHGlobalUni('Supabase Production PostgreSQL URI')

    $credential = New-Object AleProductionCredentialStore+CREDENTIAL
    $credential.Type = 1
    $credential.TargetName = $targetPointer
    $credential.UserName = $userNamePointer
    $credential.CredentialBlobSize = [uint32]$blobBytes.Length
    $credential.CredentialBlob = $blobPointer
    $credential.Persist = 2

    if (-not [AleProductionCredentialStore]::CredWrite([ref]$credential, 0)) {
        $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
        throw "Windows Credential Manager could not store the connection URI (Win32 error $errorCode)."
    }

    if (-not [AleProductionCredentialStore]::CredRead($credentialName, 1, 0, [ref]$readBack)) {
        $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
        throw "Connection URI was stored, but read-back verification failed (Win32 error $errorCode)."
    }

    $storedCredential = [Runtime.InteropServices.Marshal]::PtrToStructure(
        $readBack,
        [type][AleProductionCredentialStore+CREDENTIAL]
    )
    if ($storedCredential.CredentialBlobSize -ne $blobBytes.Length) {
        throw 'Credential read-back verification failed.'
    }

    $verifiedBytes = New-Object byte[] $storedCredential.CredentialBlobSize
    [Runtime.InteropServices.Marshal]::Copy(
        $storedCredential.CredentialBlob,
        $verifiedBytes,
        0,
        $verifiedBytes.Length
    )

    $matches = $true
    for ($index = 0; $index -lt $blobBytes.Length; $index++) {
        if ($blobBytes[$index] -ne $verifiedBytes[$index]) {
            $matches = $false
        }
    }
    if (-not $matches) {
        throw 'Credential read-back verification failed.'
    }

    'Production database URI stored and verified in Windows Credential Manager. Its value was not displayed.'
}
finally {
    if ($readBack -ne [IntPtr]::Zero) {
        [AleProductionCredentialStore]::CredFree($readBack)
    }
    if ($uriPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($uriPointer)
    }
    if ($uriBytes) {
        [Array]::Clear($uriBytes, 0, $uriBytes.Length)
    }
    if ($blobBytes) {
        [Array]::Clear($blobBytes, 0, $blobBytes.Length)
    }
    if ($verifiedBytes) {
        [Array]::Clear($verifiedBytes, 0, $verifiedBytes.Length)
    }
    if ($blobPointer -ne [IntPtr]::Zero) {
        $zeroes = New-Object byte[] $uriBytes.Length
        [Runtime.InteropServices.Marshal]::Copy($zeroes, 0, $blobPointer, $zeroes.Length)
        [Runtime.InteropServices.Marshal]::FreeHGlobal($blobPointer)
    }
    if ($targetPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::FreeHGlobal($targetPointer)
    }
    if ($userNamePointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::FreeHGlobal($userNamePointer)
    }
    $connectionUri = $null
    $parsedUri = $null
}
