# Legt die Verknüpfungen "Lernheft" auf dem Desktop und im Startmenü an.
# Sie tragen dieselbe App-Kennung wie das Programm (ch.lernheft.app), damit das
# Anheften an die Taskleiste und das Symbol des laufenden Fensters zusammenpassen.
param([string]$Ziel, [string]$Wurzel)

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class AppKennung {
  [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IPropertyStore {
    void GetCount(out uint c); void GetAt(uint i, out PropertyKey k); void GetValue(ref PropertyKey k, out PropVariant v);
    void SetValue(ref PropertyKey k, ref PropVariant v); void Commit();
  }
  [StructLayout(LayoutKind.Sequential, Pack = 4)] struct PropertyKey { public Guid fmtid; public uint pid; }
  [StructLayout(LayoutKind.Explicit)] struct PropVariant { [FieldOffset(0)] public ushort vt; [FieldOffset(8)] public IntPtr p; [FieldOffset(8)] public long platz; }
  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
  static extern void SHGetPropertyStoreFromParsingName(string pfad, IntPtr pbc, int flags, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out IPropertyStore store);
  public static void Setze(string lnk, string id) {
    Guid iid = new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99");
    IPropertyStore s;
    SHGetPropertyStoreFromParsingName(lnk, IntPtr.Zero, 2, ref iid, out s);
    PropertyKey k = new PropertyKey { fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), pid = 5 };
    PropVariant v = new PropVariant();
    v.vt = 31;
    v.p = Marshal.StringToCoTaskMemUni(id);
    s.SetValue(ref k, ref v);
    s.Commit();
    Marshal.FreeCoTaskMem(v.p);
    Marshal.ReleaseComObject(s);
  }
}
'@

$shell = New-Object -ComObject WScript.Shell
$orte = @([Environment]::GetFolderPath('Desktop'), (Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs'))
foreach ($ort in $orte) {
  $lnk = Join-Path $ort 'Lernheft.lnk'
  if (Test-Path $lnk) { Remove-Item $lnk -Force }
  $v = $shell.CreateShortcut($lnk)
  $v.TargetPath = $Ziel
  $v.WorkingDirectory = Split-Path $Ziel
  $v.IconLocation = "$Ziel,0"
  $v.Description = 'Lernheft'
  $v.Save()
  [AppKennung]::Setze($lnk, 'ch.lernheft.app')
  Write-Host "Verknuepfung: $lnk"
}
