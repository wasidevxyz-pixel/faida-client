namespace BiometricApp;

static class Program
{
    /// <summary>
    ///  The main entry point for the application.
    /// </summary>
    [STAThread]
    static void Main(string[]? args = null)
    {
        try {
            System.IO.File.WriteAllText(@"D:\BAS-SOFTWARE\feature-dual-biometric-face\args_debug.txt", string.Join(" | ", Environment.GetCommandLineArgs()));
        } catch { }

        var cmdArgs = Environment.GetCommandLineArgs();
        if (cmdArgs != null && cmdArgs.Length > 1 && cmdArgs[1] == "--test-models")
        {
            FaceEngine.TestModelInference();
            return;
        }

        // 0. IMMEDIATE Win7 Compatibility Fix (Must be first lines)
        try {
            Environment.SetEnvironmentVariable("DOTNET_SYSTEM_GLOBALIZATION_INVARIANT", "1");
            AppContext.SetSwitch("System.Globalization.Invariant", true);
        } catch { }

        try {
            // 1. Force TLS 1.2 and 1.3 for Windows 7/8/10 compatibility
            // ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12 | SecurityProtocolType.Tls13;
            // Since some older frameworks don't have these enums, we use the numeric values:
            // Tls12 = 3072, Tls13 = 12288
            try {
                System.Net.ServicePointManager.SecurityProtocol = (System.Net.SecurityProtocolType)(3072 | 12288);
            } catch {
                try { System.Net.ServicePointManager.SecurityProtocol = (System.Net.SecurityProtocolType)3072; } catch { }
            }

            // 2. Windows 7 Check & User Friendly Error
            if (Environment.OSVersion.Version.Major == 6 && Environment.OSVersion.Version.Minor == 1) {
                // We are on Windows 7. The .csproj changes (InvariantGlobalization) 
                // should prevent the DateTime crash, but we still want to warn if something is wrong.
            }

            // 3. Application setup
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            
            try { ApplicationConfiguration.Initialize(); } catch { }

            // Register native library resolver for OpenCvSharp in portable single-file mode
            try {
                System.Runtime.InteropServices.NativeLibrary.SetDllImportResolver(
                    typeof(OpenCvSharp.Cv2).Assembly,
                    (libraryName, assembly, searchPath) => {
                        string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                        string candidate = System.IO.Path.Combine(baseDir, libraryName.EndsWith(".dll", StringComparison.OrdinalIgnoreCase) ? libraryName : libraryName + ".dll");
                        if (System.IO.File.Exists(candidate)) {
                            return System.Runtime.InteropServices.NativeLibrary.Load(candidate);
                        }
                        return IntPtr.Zero;
                    }
                );
            } catch { }

            // Global Error Handling
            Application.ThreadException += (s, e) => ShowError(e.Exception);
            AppDomain.CurrentDomain.UnhandledException += (s, e) => ShowError(e.ExceptionObject as Exception);

            Application.Run(new Form1());
        } catch (Exception ex) {
            ShowError(ex);
        }
    }

    private static void ShowError(Exception ex) {
        if (ex == null) return;
        
        string errorType = ex.GetType().Name;
        string msg = ex.Message;
        string details = ex.ToString();
        
        try {
            string logPath = System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "crash_log.txt");
            System.IO.File.WriteAllText(logPath, $"[{DateTime.UtcNow:u}] {errorType}: {msg}\n\n{details}");
        } catch { }

        // Specially handle the TimerQueue/DateTime crash common on Win7
        if (msg.Contains("TimerQueue") || msg.Contains("DateTime")) {
            msg = "Windows 7 Compatibility Issue detected.\n\n" +
                  "Please ensure you have installed Windows 7 Service Pack 1 and KB3140245 (TLS 1.2 support).\n" +
                  "Technical details: " + msg;
        }

        if (ex.InnerException != null) msg += "\n\nInner Exception: " + ex.InnerException.Message;
        
        string displayDetails = details.Length > 400 ? details.Substring(0, 400) + "..." : details;
        MessageBox.Show(
            $"Unable to start application.\n\n[{errorType}] {msg}\n\nTechnical details:\n{displayDetails}", 
            "Critical Startup Error", 
            MessageBoxButtons.OK, 
            MessageBoxIcon.Stop
        );
        
        Application.Exit();
    }
}    
