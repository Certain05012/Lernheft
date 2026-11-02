// Lernheft.exe im Lernheft-Ordner: startet das eigentliche Programm in Programm\App
using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

static class Starter
{
    [STAThread]
    static void Main(string[] args)
    {
        string wurzel = AppDomain.CurrentDomain.BaseDirectory;
        string exe = Path.Combine(wurzel, "Programm", "App", "Lernheft.exe");
        if (!File.Exists(exe))
        {
            MessageBox.Show("Das Programm wurde nicht gefunden:\n" + exe, "Lernheft", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }
        var start = new ProcessStartInfo(exe);
        start.WorkingDirectory = Path.GetDirectoryName(exe);
        start.UseShellExecute = false;
        start.EnvironmentVariables["LERNHEFT_ORDNER"] = wurzel.TrimEnd('\\');
        foreach (string a in args) start.Arguments += "\"" + a + "\" ";
        Process.Start(start);
    }
}
