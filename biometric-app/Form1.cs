using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Json;
using System.Net.Security;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Linq;
using System.Drawing;
using DPFP;
using DPFP.Capture;
using System.IO;

namespace BiometricApp
{
    public partial class Form1 : Form, DPFP.Capture.EventHandler
    {
        private HttpClient _client;
        private Config _config;
        private string _token;
        private List<Employee> _attendanceEmployees = new List<Employee>();
        private List<Employee> _registrationEmployees = new List<Employee>();
        private List<Store> _stores = new List<Store>();
        private System.Windows.Forms.Timer _backgroundSyncTimer;
        private Capture _capturer;
        private System.Windows.Forms.Timer _uiResetTimer;
        private System.Windows.Forms.Timer? _fingerTouchTimeoutTimer;
        private Dictionary<string, DPFP.Template> _cachedFingerprintTemplates = new Dictionary<string, DPFP.Template>();
        private int _scanProcessingLock = 0; // Atomic thread-safe scan lock
        private bool _isProcessingScan => Volatile.Read(ref _scanProcessingLock) != 0;
        private int _consecutiveFingerFailures = 0; // Gate automatic face fallback

        private DateTime SafeNow {
            get {
                try { return DateTime.Now; }
                catch { return new DateTime(1970, 1, 1); } // Fallback for broken OS
            }
        }

        public Form1()
        {
            InitializeComponent();
            
            var version = System.Reflection.Assembly.GetExecutingAssembly().GetName().Version;
            string versionText = $"v{version?.Major ?? 27} (Face AI Edition)";
            this.Text = $"BAS Dual Biometric & Face AI Bridge {versionText}";
            this.lblAppTitle.Text = $"BAS DUAL BIO v{version?.Major ?? 27}";

            // Wire Dual Biometric Auto-Switch & Return Handlers
            viewFaceAttendance.AttendancePunchedSuccessfully += () =>
            {
                if (this.InvokeRequired) this.BeginInvoke(new Action(() => {
                    viewFaceAttendance.ResetCardToIdle();
                    viewFaceAttendance.ClearCameraFrame();
                    ShowView("attendance");
                }));
                else {
                    viewFaceAttendance.ResetCardToIdle();
                    viewFaceAttendance.ClearCameraFrame();
                    ShowView("attendance");
                }
            };
            viewFaceAttendance.BackToFingerprintRequested += () =>
            {
                if (this.InvokeRequired) this.BeginInvoke(new Action(() => {
                    viewFaceAttendance.ResetCardToIdle();
                    viewFaceAttendance.ClearCameraFrame();
                    ShowView("attendance");
                }));
                else {
                    viewFaceAttendance.ResetCardToIdle();
                    viewFaceAttendance.ClearCameraFrame();
                    ShowView("attendance");
                }
            };
            viewFaceDiagnostic.Initialize();
            viewFaceDiagnostic.BackRequested += () =>
            {
                if (this.InvokeRequired) this.BeginInvoke(new Action(() => ShowView("face-attendance")));
                else ShowView("face-attendance");
            };

            // Wire Auto-reconnect on USB Device Change
            UsbDeviceChanged += () =>
            {
                try {
                    if (this.InvokeRequired) {
                        this.BeginInvoke(new Action(() => {
                            if (_capturer == null || lblScannerStatus.Text.Contains("Disconnected") || lblScannerStatus.Text.Contains("Missing")) {
                                InitScanner();
                            }
                        }));
                    } else {
                        if (_capturer == null || lblScannerStatus.Text.Contains("Disconnected") || lblScannerStatus.Text.Contains("Missing")) {
                            InitScanner();
                        }
                    }
                } catch { }
            };

            // Wire Biometric Register Search & Filter
            txtRegSearch.TextChanged += (s, e) => FilterEmployeesByBranch();
            txtRegSearch.KeyDown += (s, e) => {
                if (e.KeyCode == Keys.Enter)
                {
                    e.SuppressKeyPress = true;
                    if (cmbRegEmployees.Items.Count > 0)
                    {
                        btnOpenEnrollment.Focus();
                    }
                }
                else if (e.KeyCode == Keys.Down)
                {
                    e.SuppressKeyPress = true;
                    cmbRegEmployees.Focus();
                }
            };
            btnRegClearSearch.Click += (s, e) => {
                txtRegSearch.Clear();
                txtRegSearch.Focus();
            };

            this.Load += async (s, e) => await SafeInitializeApp();
        }

        private async Task SafeInitializeApp()
        {
            try {
                // Force protocols that work with modern servers (Cloudflare) safely
                try {
                    System.Net.ServicePointManager.SecurityProtocol = 
                        System.Net.SecurityProtocolType.Tls12 | 
                        System.Net.SecurityProtocolType.Tls13;
                } catch {
                    try {
                        System.Net.ServicePointManager.SecurityProtocol = System.Net.SecurityProtocolType.Tls12;
                    } catch { }
                }

                _config = Config.Load();
                
                var handler = new HttpClientHandler();
                handler.SslProtocols = System.Security.Authentication.SslProtocols.None;

                // Strict TLS Certificate Validation (Rejects invalid certificates in production)
                // Only bypasses if connecting to local loopback (localhost/127.0.0.1) for testing
                handler.ServerCertificateCustomValidationCallback = (message, cert, chain, errors) =>
                {
                    if (errors == System.Net.Security.SslPolicyErrors.None) return true;
                    if (message.RequestUri != null && (message.RequestUri.IsLoopback || message.RequestUri.Host == "localhost"))
                        return true;
                    return false;
                };
                handler.Proxy = null; // Bypass Windows 10 WPAD proxy lookup to prevent connection blocking
                handler.UseProxy = false;

                _client = new HttpClient(handler);
                _client.Timeout = TimeSpan.FromSeconds(30); // 30s per request — 300s was masking slow network issues
                // V9 FIX: ConnectionClose removed — keep-alive reuses TCP connection, saves 1-3s per scan
                _client.DefaultRequestHeaders.ExpectContinue = false;
                
                // Add User-Agent to prevent server/Cloudflare from dropping "bot-like" requests
                _client.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

                // Ensure ServerUrl ends with a slash
                string baseUrl = _config.ServerUrl;
                if (!string.IsNullOrEmpty(baseUrl) && !baseUrl.EndsWith("/")) baseUrl += "/";
                _client.BaseAddress = new Uri(baseUrl);

                // Start background sync safely (every 5 minutes to prevent frequent UI freezing or CPU spikes)
                _backgroundSyncTimer = new System.Windows.Forms.Timer();
                _backgroundSyncTimer.Interval = 300000;
                _backgroundSyncTimer.Tick += (s, e) => SafeSync();
                _backgroundSyncTimer.Start();

                RoundPanel(pnlLogin, 30);
                InitScanner();

                lblActiveBranch.Text = "BRANCH: " + (_config.Branch ?? "Searching...").ToUpper();
                lblLoginFooter.Text = $"This software is designed by Bilal Shah | 0348-5511763\nServer: {_config.ServerUrl}";
                txtPassword.UseSystemPasswordChar = true;

                // Restore Remember Me credentials if saved
                if (_config.RememberMe)
                {
                    chkRememberMe.Checked = true;
                    txtEmail.Text = _config.SavedUsername ?? "";
                    txtPassword.Text = _config.SavedPassword ?? "";
                }

                // Pressing Enter key triggers Sign In button
                this.AcceptButton = btnLogin;
                txtEmail.KeyDown += (s, e) =>
                {
                    if (e.KeyCode == Keys.Enter)
                    {
                        e.SuppressKeyPress = true;
                        if (string.IsNullOrWhiteSpace(txtPassword.Text))
                        {
                            txtPassword.Focus();
                        }
                        else
                        {
                            btnLogin.PerformClick();
                        }
                    }
                };
                txtPassword.KeyDown += (s, e) =>
                {
                    if (e.KeyCode == Keys.Enter)
                    {
                        e.SuppressKeyPress = true;
                        btnLogin.PerformClick();
                    }
                };

                // Load branches and employees in background immediately on startup — form opens without delay
                _ = Task.Run(async () =>
                {
                    try
                    {
                        await Task.WhenAll(LoadStores(), SyncAllEmployees());
                        Action initViews = () =>
                        {
                            viewFaceAttendance.Initialize(_client, _config);
                            viewFaceRegister.Initialize(_client, _config, _stores, _registrationEmployees);
                        };
                        if (this.InvokeRequired) this.BeginInvoke(initViews);
                        else initViews();
                    }
                    catch { }
                });
            }
            catch (Exception ex) {
                MessageBox.Show("Initialization Warning: " + ex.Message);
            }
        }



        private void pnlLoginLeft_Paint(object sender, PaintEventArgs e)
        {
            using (var brush = new System.Drawing.Drawing2D.LinearGradientBrush(
                pnlLoginLeft.ClientRectangle,
                Color.FromArgb(105, 125, 240), // Top Blue
                Color.FromArgb(120, 80, 160),  // Bottom Purple
                90F))
            {
                e.Graphics.FillRectangle(brush, pnlLoginLeft.ClientRectangle);
            }
        }

        private void RoundPanel(Panel pnl, int radius)
        {
            System.Drawing.Drawing2D.GraphicsPath path = new System.Drawing.Drawing2D.GraphicsPath();
            path.AddArc(0, 0, radius, radius, 180, 90);
            path.AddArc(pnl.Width - radius, 0, radius, radius, 270, 90);
            path.AddArc(pnl.Width - radius, pnl.Height - radius, radius, radius, 0, 90);
            path.AddArc(0, pnl.Height - radius, radius, radius, 90, 90);
            path.CloseFigure();
            pnl.Region = new Region(path);
        }

        [System.Runtime.InteropServices.DllImport("kernel32.dll", CharSet = System.Runtime.InteropServices.CharSet.Auto, SetLastError = true)]
        private static extern IntPtr LoadLibrary(string libname);

        [System.Runtime.InteropServices.DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool FreeLibrary(IntPtr hModule);

        public static bool IsDigitalPersonaDriverInstalled()
        {
            try
            {
                IntPtr hModule = LoadLibrary("DPFPApi.dll");
                if (hModule != IntPtr.Zero)
                {
                    FreeLibrary(hModule);
                    return true;
                }
            }
            catch { }
            return false;
        }

        private void InitScanner()
        {
            try {
                if (!IsDigitalPersonaDriverInstalled())
                {
                    _capturer = null;
                    UpdateScannerStatus(false, "Scanner: Runtime Missing (Install DigitalPersona OneTouch RTE)");
                    Console.WriteLine("DigitalPersona driver (DPFPApi.dll) is not installed on this machine.");
                    return;
                }

                if (_capturer == null)
                {
                    _capturer = new Capture();
                    _capturer.EventHandler = this;
                    _capturer.StartCapture();
                }

                // Check if any reader is currently plugged in
                bool hasReader = false;
                try
                {
                    var readers = new DPFP.Capture.ReadersCollection();
                    if (readers != null && readers.Count > 0)
                    {
                        hasReader = true;
                    }
                }
                catch { }

                UpdateScannerStatus(hasReader);
            } catch (Exception ex) {
                if (_capturer != null) {
                    try { GC.SuppressFinalize(_capturer); } catch { }
                    _capturer = null;
                }
                UpdateScannerStatus(false);
                Console.WriteLine("Scanner initialization notice: " + ex.Message);
            }
        }

        private void UpdateScannerStatus(bool connected, string? customMessage = null)
        {
            if (this.InvokeRequired) { this.BeginInvoke(new Action(() => UpdateScannerStatus(connected, customMessage))); return; }
            
            lblScannerStatus.Text = connected ? "Scanner: Connected (Digital Persona 4500)" : (customMessage ?? "Scanner: Disconnected (Plug in machine)");
            pnlScannerStatus.BackColor = connected ? Color.FromArgb(230, 255, 230) : Color.FromArgb(255, 230, 230);
        }

        // --- Windows USB Plug-and-Play Device Detection ---
        private const int WM_DEVICECHANGE = 0x0219;
        public static event Action? UsbDeviceChanged;
        private System.Windows.Forms.Timer? _usbDebounceTimer;

        protected override void WndProc(ref Message m)
        {
            base.WndProc(ref m);
            if (m.Msg == WM_DEVICECHANGE)
            {
                if (_usbDebounceTimer == null)
                {
                    _usbDebounceTimer = new System.Windows.Forms.Timer { Interval = 1500 };
                    _usbDebounceTimer.Tick += (s, e) =>
                    {
                        _usbDebounceTimer?.Stop();
                        _usbDebounceTimer?.Dispose();
                        _usbDebounceTimer = null;
                        UsbDeviceChanged?.Invoke();
                    };
                }
                _usbDebounceTimer.Stop();
                _usbDebounceTimer.Start();
            }
        }

        // --- DPFP.Capture.EventHandler Implementation ---
        public void OnComplete(object Capture, string ReaderSerialNumber, Sample Sample)
        {
            // Real scan captured! Stop touch timer immediately
            try
            {
                if (this.InvokeRequired)
                {
                    this.BeginInvoke(new Action(() => _fingerTouchTimeoutTimer?.Stop()));
                }
                else
                {
                    _fingerTouchTimeoutTimer?.Stop();
                }
            }
            catch { }

            ProcessAttendance(Sample);
        }

        public void OnFingerGone(object Capture, string ReaderSerialNumber)
        {
            if (this.InvokeRequired)
            {
                this.BeginInvoke(new Action(() => OnFingerGone(Capture, ReaderSerialNumber)));
                return;
            }

            // If user lifted finger prematurely and scanner is not actively verifying
            if (!_isProcessingScan && viewAttendance.Visible && lblReadyToScan.Text == "Reading finger...")
            {
                _fingerTouchTimeoutTimer?.Stop();
                _fingerTouchTimeoutTimer?.Dispose();
                _fingerTouchTimeoutTimer = new System.Windows.Forms.Timer { Interval = 800 };
                _fingerTouchTimeoutTimer.Tick += (s, e) =>
                {
                    _fingerTouchTimeoutTimer?.Stop();
                    if (!_isProcessingScan && viewAttendance.Visible && lblReadyToScan.Text == "Reading finger...")
                    {
                        ResetAttendanceUI();
                    }
                };
                _fingerTouchTimeoutTimer.Start();
            }
        }

        public void OnFingerTouch(object Capture, string ReaderSerialNumber)
        {
            if (this.InvokeRequired)
            {
                this.BeginInvoke(new Action(() => OnFingerTouch(Capture, ReaderSerialNumber)));
                return;
            }
            if (viewAttendance.Visible)
            {
                _uiResetTimer?.Stop();
                ClearRightPanel();
                UpdateAttendanceStatus("Reading finger...", Color.DarkBlue);

                // Safety timeout: If no valid sample capture completes within 3.5s, auto-reset to READY TO SCAN
                _fingerTouchTimeoutTimer?.Stop();
                _fingerTouchTimeoutTimer?.Dispose();
                _fingerTouchTimeoutTimer = new System.Windows.Forms.Timer { Interval = 3500 };
                _fingerTouchTimeoutTimer.Tick += (s, e) =>
                {
                    _fingerTouchTimeoutTimer?.Stop();
                    if (!_isProcessingScan && viewAttendance.Visible && lblReadyToScan.Text == "Reading finger...")
                    {
                        ResetAttendanceUI();
                    }
                };
                _fingerTouchTimeoutTimer.Start();
            }
        }

        public void OnReaderConnect(object Capture, string ReaderSerialNumber)
        {
            UpdateScannerStatus(true);
        }

        public void OnReaderDisconnect(object Capture, string ReaderSerialNumber)
        {
            UpdateScannerStatus(false);
        }

        public void OnSampleQuality(object Capture, string ReaderSerialNumber, CaptureFeedback CaptureFeedback)
        {
            if (CaptureFeedback != CaptureFeedback.Good)
            {
                if (this.InvokeRequired)
                {
                    this.BeginInvoke(new Action(() => OnSampleQuality(Capture, ReaderSerialNumber, CaptureFeedback)));
                    return;
                }
                if (viewAttendance.Visible && !_isProcessingScan)
                {
                    UpdateAttendanceStatus("Smudge / Low Quality. Place finger flat.", Color.DarkOrange);
                    _uiResetTimer?.Stop();
                    _uiResetTimer = new System.Windows.Forms.Timer { Interval = 2000 };
                    _uiResetTimer.Tick += (s, e) => { _uiResetTimer.Stop(); ResetAttendanceUI(); };
                    _uiResetTimer.Start();
                }
            }
        }

        private void ShowView(string viewName)
        {
            if (viewName == "face-attendance")
            {
                viewFaceAttendance.ResetCardToIdle();
                viewFaceAttendance.ClearCameraFrame();
            }

            viewAttendance.Visible = (viewName == "attendance");
            viewRegister.Visible = (viewName == "register");
            viewFaceAttendance.Visible = (viewName == "face-attendance");
            viewFaceRegister.Visible = (viewName == "face-register");
            viewFaceDiagnostic.Visible = (viewName == "diagnostic");
            
            pnlSidebar.Visible = true;
            pnlLogin.Visible = false;

            btnNavAttendance.BackColor = (viewName == "attendance") ? System.Drawing.Color.FromArgb(70, 70, 70) : System.Drawing.Color.Transparent;
            btnNavRegister.BackColor = (viewName == "register") ? System.Drawing.Color.FromArgb(70, 70, 70) : System.Drawing.Color.Transparent;
            btnNavFaceAttendance.BackColor = (viewName == "face-attendance") ? System.Drawing.Color.FromArgb(70, 70, 70) : System.Drawing.Color.Transparent;
            btnNavFaceRegister.BackColor = (viewName == "face-register") ? System.Drawing.Color.FromArgb(70, 70, 70) : System.Drawing.Color.Transparent;
            btnNavFaceDiagnostic.BackColor = (viewName == "diagnostic") ? System.Drawing.Color.FromArgb(70, 70, 70) : System.Drawing.Color.Transparent;

            // Camera lifecycle management
            if (viewName == "face-attendance")
            {
                viewFaceRegister.StopCamera();
                viewFaceDiagnostic.StopCamera();
                viewFaceAttendance.ResetCardToIdle();
                viewFaceAttendance.SetBackupMode(false);
                _ = viewFaceAttendance.LoadEnrolledEmployees();
                viewFaceAttendance.StartCamera();
            }
            else if (viewName == "face-register")
            {
                viewFaceAttendance.StopCamera();
                viewFaceDiagnostic.StopCamera();
                viewFaceRegister.UpdateEmployees(_stores, _registrationEmployees);
                viewFaceRegister.StartCamera();
                viewFaceRegister.PopulateDropdowns();
            }
            else if (viewName == "diagnostic")
            {
                viewFaceAttendance.StopCamera();
                viewFaceRegister.StopCamera();
                viewFaceDiagnostic.StartCamera();
            }
            else
            {
                viewFaceAttendance.StopCamera();
                viewFaceRegister.StopCamera();
                viewFaceDiagnostic.StopCamera();
            }

            if (viewName == "attendance")
            {
                ResetAttendanceUI();
            }
            else if (viewName == "register")
            {
                FilterEmployeesByBranch();
                txtRegSearch?.Focus();
            }
        }

        private void ShowAttendanceError(Employee emp, string message)
        {
            if (this.InvokeRequired) { this.BeginInvoke(new Action(() => ShowAttendanceError(emp, message))); return; }
            
            lblReadyToScan.Text = "SCAN REJECTED";
            lblReadyToScan.ForeColor = Color.Red;
            
            tblAttendanceRight.Visible = true;
            pnlAttendanceRightContent.BackColor = Color.FromArgb(255, 240, 240);
            lblWaitPlaceholder.Visible = false;
            
            bool isAlready = message.IndexOf("Already", StringComparison.OrdinalIgnoreCase) >= 0;
            string origTime12h = "";
            var timeMatch = System.Text.RegularExpressions.Regex.Match(message, @"at\s+(\d{1,2}:\d{2})", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            if (timeMatch.Success && DateTime.TryParseExact(timeMatch.Groups[1].Value, "H:mm", System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out var origDt))
            {
                origTime12h = origDt.ToString("hh:mm tt");
            }

            lblSuccessStatus.Text = isAlready 
                ? (!string.IsNullOrEmpty(origTime12h) ? $"ALREADY CHECKED OUT (AT {origTime12h})" : "ALREADY CHECKED OUT")
                : message.ToUpper();
            lblSuccessStatus.ForeColor = Color.OrangeRed; 
            lblSuccessStatus.Visible = true;
            
            lblSuccessName.Text = emp.name.ToUpper();
            lblSuccessName.ForeColor = Color.FromArgb(50, 50, 50);
            lblSuccessName.Visible = true;
            
            lblSuccessCode.Text = "Employee Code: " + emp.code;
            lblSuccessCode.ForeColor = Color.Gray;
            lblSuccessCode.Visible = true;
            
            lblSuccessTime.Text = "Transaction Time: " + SafeNow.ToString("hh:mm:ss tt");
            lblSuccessTime.ForeColor = Color.Red;
            lblSuccessTime.Font = new Font("Segoe UI", 16f, FontStyle.Bold);
            lblSuccessTime.Visible = true;

            // Load Profile Picture anyway
            string picField = !string.IsNullOrEmpty(emp.photo) ? emp.photo : emp.profilePicture;
            LoadProfileImage(picField);

            // Reset after 2 seconds
            _uiResetTimer?.Stop();
            _uiResetTimer?.Dispose();
            _uiResetTimer = new System.Windows.Forms.Timer { Interval = 2000 };
            _uiResetTimer.Tick += (s, e) => { 
                _uiResetTimer?.Stop(); 
                _uiResetTimer?.Dispose();
                _uiResetTimer = null;
                ResetAttendanceUI(); 
            };
            _uiResetTimer.Start();
        }

        private void ResetAttendanceUI()
        {
            if (this.InvokeRequired) { this.BeginInvoke(new Action(ResetAttendanceUI)); return; }
            
            resetTimer.Stop();
            
            // Scanner Side (Left)
            lblReadyToScan.Text = "READY TO SCAN";
            lblReadyToScan.ForeColor = Color.FromArgb(100, 100, 100);
            lblReadyToScan.Visible = true;
            lblscanInstruction.Visible = true;
            picAttendanceFinger.Image = null;
            picAttendanceFinger.Image = null;

            // Result Side (Right) - Waiting State
            tblAttendanceRight.Visible = false;
            pnlAttendanceRightContent.BackColor = Color.White;
            lblWaitPlaceholder.Text = "EMPLOYEE DETAILS WILL APPEAR HERE";
            lblWaitPlaceholder.Visible = true;
            
            picSuccessProfile.Image = null; // Clear Profile
            lblSuccessName.Visible = false;
            lblSuccessCode.Visible = false;
            lblSuccessStatus.Visible = false;
            lblSuccessTime.Visible = false;
        }

        private void Logout()
        {
            _token = null;
            pnlSidebar.Visible = false;
            pnlLogin.Visible = true;
            viewAttendance.Visible = false;
            viewRegister.Visible = false;
            viewFaceAttendance.Visible = false;
            viewFaceRegister.Visible = false;
            viewFaceDiagnostic.Visible = false;
            viewFaceAttendance.StopCamera();
            viewFaceRegister.StopCamera();
            viewFaceDiagnostic.StopCamera();
            txtPassword.Clear();
            MessageBox.Show("Logged out successfully.");
        }

        private async void btnLogin_Click(object sender, EventArgs e)
        {
            try
            {
                btnLogin.Enabled = false;
                btnLogin.Text = "Authenticating...";
                
                var loginData = new LoginRequest
                {
                    email = txtEmail.Text.Trim(),
                    password = txtPassword.Text
                };

                var response = await _client.PostAsJsonAsync("api/v1/auth/login", loginData);

                if (response.IsSuccessStatusCode)
                {
                    var result = await response.Content.ReadFromJsonAsync<LoginResponse>();
                    _token = result?.token;
                    
                    if (string.IsNullOrEmpty(_token)) {
                        MessageBox.Show("Login successful but no token received.", "Auth Error");
                        return;
                    }

                    // Save Remember Me state
                    if (chkRememberMe.Checked)
                    {
                        _config.RememberMe = true;
                        _config.SavedUsername = txtEmail.Text.Trim();
                        _config.SavedPassword = txtPassword.Text;
                    }
                    else
                    {
                        _config.RememberMe = false;
                        _config.SavedUsername = "";
                        _config.SavedPassword = "";
                    }

                    // Capture branch selection on login
                    if (cmbAttendanceBranch.SelectedValue != null)
                    {
                        _config.Branch = cmbAttendanceBranch.SelectedValue.ToString();
                    }
                    Config.Save(_config);

                    _client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _token);
                    ShowView("attendance");
                    await LoadInitialData();
                }
                else
                {
                    string errorBody = await response.Content.ReadAsStringAsync();
                    MessageBox.Show($"Login Failed!\nStatus: {response.StatusCode}\nMessage: {errorBody}", "Login Error");
                }
            }
            catch (Exception ex)
            {
                string msg = ex.Message;
                if (ex.InnerException != null) msg += "\nInner: " + ex.InnerException.Message;
                MessageBox.Show("Connection Error: " + msg, "Error");
            }
            finally
            {
                btnLogin.Enabled = true;
                btnLogin.Text = "Login to Dashboard";
            }
        }

        private async Task LoadInitialData()
        {
            // Run stores and employees in parallel — faster than sequential
            try { 
                await Task.WhenAll(LoadStores(), SyncAllEmployees()); 
                viewFaceAttendance.Initialize(_client, _config);
                viewFaceRegister.Initialize(_client, _config, _stores, _registrationEmployees);
            } catch { }
        }

        private async Task LoadStores()
        {
            try
            {
                // Run on background thread so UI never freezes during network call
                var stores = await Task.Run(async () =>
                {
                    var req = new HttpRequestMessage(HttpMethod.Get, "api/v1/stores?showAll=true");
                    req.Headers.TryAddWithoutValidation("bas-secret-key", _config.SecretKey);
                    var response = await _client.SendAsync(req);
                    if (!response.IsSuccessStatusCode) return new List<Store>();
                    var result = await response.Content.ReadFromJsonAsync<StoreResponse>();
                    return result?.data ?? new List<Store>();
                });

                _stores = stores;

                // Update UI on UI thread
                if (this.InvokeRequired) this.Invoke(new Action(PopulateBranchSelectors));
                else PopulateBranchSelectors();
            }
            catch (Exception ex)
            {
                Console.WriteLine("LoadStores error: " + ex.Message);
                // Show error on UI thread without blocking
                Action show = () => MessageBox.Show("Error loading branches: " + ex.Message, "Branch Load Error");
                if (this.InvokeRequired) this.BeginInvoke(show);
                else show();
            }
        }

        private void PopulateBranchSelectors()
        {
            if (_stores == null || _stores.Count == 0) return;

            // Update Screen Label
            lblActiveBranch.Text = "BRANCH: " + (string.IsNullOrEmpty(_config.Branch) ? "Not Selected" : _config.Branch).ToUpper();

            // Temporarily disable events to prevent auto-save during binding
            cmbAttendanceBranch.SelectedIndexChanged -= BranchSelectionChanged;
            cmbRegBranches.SelectedIndexChanged -= RegBranchSelectionChanged;

            cmbAttendanceBranch.DataSource = new List<Store>(_stores);
            cmbAttendanceBranch.DisplayMember = "name";
            cmbAttendanceBranch.ValueMember = "name";

            cmbRegBranches.DataSource = new List<Store>(_stores);
            cmbRegBranches.DisplayMember = "name";
            cmbRegBranches.ValueMember = "name";

            if (!string.IsNullOrEmpty(_config.Branch))
            {
                cmbAttendanceBranch.SelectedValue = _config.Branch;
                cmbRegBranches.SelectedValue = _config.Branch;
            }

            cmbAttendanceBranch.SelectedIndexChanged += BranchSelectionChanged;
            cmbRegBranches.SelectedIndexChanged += RegBranchSelectionChanged;
        }

        private void BranchSelectionChanged(object sender, EventArgs e)
        {
            if (cmbAttendanceBranch.SelectedValue != null)
            {
                _config.Branch = cmbAttendanceBranch.SelectedValue.ToString();
                Config.Save(_config);
                lblActiveBranch.Text = "BRANCH: " + _config.Branch.ToUpper();
                Console.WriteLine("Branch updated to: " + _config.Branch);
            }
        }

        private void RegBranchSelectionChanged(object sender, EventArgs e)
        {
            txtRegSearch?.Clear();
            FilterEmployeesByBranch();
        }

        private string CleanBranch(string input)
        {
            if (string.IsNullOrEmpty(input)) return "";
            return input.Replace("(", "").Replace(")", "").Replace("[", "").Replace("]", "").Trim().ToUpper();
        }

        private void FilterEmployeesByBranch()
        {
            if (cmbRegBranches.SelectedValue == null) return;
            string selectedBranch = cmbRegBranches.SelectedValue.ToString();
            string cleanSelected = CleanBranch(selectedBranch);
            string query = txtRegSearch?.Text?.Trim() ?? string.Empty;

            var branchFiltered = _registrationEmployees.Where(e =>
            {
                if (string.IsNullOrEmpty(e.branch)) return false;
                return CleanBranch(e.branch) == cleanSelected;
            }).ToList();

            var searchFiltered = branchFiltered.Where(e =>
            {
                if (string.IsNullOrEmpty(query)) return true;
                bool matchCode = e.code != null && e.code.IndexOf(query, StringComparison.OrdinalIgnoreCase) >= 0;
                bool matchName = e.name != null && e.name.IndexOf(query, StringComparison.OrdinalIgnoreCase) >= 0;
                return matchCode || matchName;
            }).ToList();

            var displayList = searchFiltered.Select(e => new {
                e._id,
                e.code,
                e.name,
                Display = $"{e.code} - {e.name}"
            }).ToList();

            cmbRegEmployees.DataSource = null;
            cmbRegEmployees.DataSource = displayList;
            cmbRegEmployees.DisplayMember = "Display";
            cmbRegEmployees.ValueMember = "_id";

            if (displayList.Count > 0)
            {
                var exactCode = displayList.FirstOrDefault(d => string.Equals(d.code, query, StringComparison.OrdinalIgnoreCase));
                if (exactCode != null)
                {
                    cmbRegEmployees.SelectedValue = exactCode._id;
                }
                else
                {
                    cmbRegEmployees.SelectedIndex = 0;
                }
            }

            if (branchFiltered.Count == 0 && _registrationEmployees.Count > 0)
            {
                lblRegStatus.ForeColor = Color.Red;
                lblRegStatus.Text = $"No matches for branch '{selectedBranch}'.\n" +
                                   $"Total Synced: {_registrationEmployees.Count}\n" +
                                   $"Sample in DB: {(_registrationEmployees.Count > 0 ? _registrationEmployees[0].branch : "None")}";
            }
            else if (!string.IsNullOrEmpty(query))
            {
                if (searchFiltered.Count == 0)
                {
                    lblRegStatus.ForeColor = Color.DarkOrange;
                    lblRegStatus.Text = $"No staff matching '{query}' in {selectedBranch} (out of {branchFiltered.Count} staff).";
                }
                else
                {
                    lblRegStatus.ForeColor = Color.DarkGreen;
                    lblRegStatus.Text = $"Found {searchFiltered.Count} match{(searchFiltered.Count == 1 ? "" : "es")} for '{query}' in {selectedBranch} (Total branch staff: {branchFiltered.Count}).";
                }
            }
            else
            {
                lblRegStatus.ForeColor = Color.Black;
                lblRegStatus.Text = $"Found {branchFiltered.Count} staff in {selectedBranch} (Total: {_registrationEmployees.Count})";
            }
        }

        private async Task SyncAllEmployees(string branchOverride = null, bool forRegistration = false)
        {
            try
            {
                // Offload network + JSON deserialization + Template caching to background thread — never freeze UI
                var syncResult = await Task.Run(async () =>
                {
                    string url = "api/v1/employees?all=true";

                    var req = new HttpRequestMessage(HttpMethod.Get, url);
                    req.Headers.TryAddWithoutValidation("bas-secret-key", _config.SecretKey);
                    var response = await _client.SendAsync(req);
                    if (!response.IsSuccessStatusCode)
                    {
                        string error = await response.Content.ReadAsStringAsync();
                        throw new Exception($"Status: {response.StatusCode} — {error}");
                    }
                    var result = await response.Content.ReadFromJsonAsync<EmployeeResponse>();
                    var emps = result?.data ?? new List<Employee>();

                    // Pre-deserialize all fingerprint templates on the background thread for instant matching!
                    var templateCache = new Dictionary<string, DPFP.Template>();
                    foreach (var emp in emps)
                    {
                        if (emp == null || string.IsNullOrEmpty(emp.fingerprintTemplate)) continue;
                        try
                        {
                            byte[] rawBytes = Convert.FromBase64String(emp.fingerprintTemplate.Trim());
                            var t = new DPFP.Template();
                            t.DeSerialize(rawBytes);
                            templateCache[emp._id] = t;
                        }
                        catch { }
                    }

                    return (Employees: emps, Templates: templateCache);
                });

                _attendanceEmployees = syncResult.Employees;
                _registrationEmployees = syncResult.Employees;
                _cachedFingerprintTemplates = syncResult.Templates;

                Action updateAll = () =>
                {
                    FilterEmployeesByBranch();
                    viewFaceRegister.UpdateEmployees(_stores, _registrationEmployees);
                };

                if (this.InvokeRequired) this.BeginInvoke(updateAll);
                else updateAll();
            }
            catch (Exception ex)
            {
                Action show = () => MessageBox.Show($"Employee sync failed:\n{ex.Message}", "Sync Error");
                if (this.InvokeRequired) this.BeginInvoke(show);
                else show();
            }
        }

        private async void SafeSync()
        {
            if (string.IsNullOrEmpty(_token)) return;
            await SyncAllEmployees();
        }

        private async void ProcessAttendance(Sample sample)
        {
            if (!viewAttendance.Visible) return;

            // Real sample received — cancel finger-touch safety timer
            try
            {
                if (this.InvokeRequired) this.BeginInvoke(new Action(() => _fingerTouchTimeoutTimer?.Stop()));
                else _fingerTouchTimeoutTimer?.Stop();
            }
            catch { }

            // Guard 1: Prevent overlapping scans atomically across thread-pool callbacks
            if (Interlocked.CompareExchange(ref _scanProcessingLock, 1, 0) != 0) return;

            try
            {
                _uiResetTimer?.Stop();
                ClearRightPanel();

                // If employees are not yet loaded, auto-sync now instead of freezing on "Reading finger..."!
                if (_attendanceEmployees == null || _attendanceEmployees.Count == 0)
                {
                    UpdateAttendanceStatus("Syncing employee records...", Color.DarkOrange);
                    await SyncAllEmployees();
                    if (_attendanceEmployees == null || _attendanceEmployees.Count == 0)
                    {
                        UpdateAttendanceStatus("No employee records found. Check connection.", Color.Red);
                        _uiResetTimer?.Stop();
                        _uiResetTimer = new System.Windows.Forms.Timer { Interval = 2500 };
                        _uiResetTimer.Tick += (s, e) => { _uiResetTimer.Stop(); ResetAttendanceUI(); };
                        _uiResetTimer.Start();
                        return;
                    }
                }

                // 1. Show the finger image immediately (non-blocking BeginInvoke)
                try {
                    var converter = new DPFP.Capture.SampleConversion();
                    Bitmap bitmap = null;
                    converter.ConvertToPicture(sample, ref bitmap);
                    if (bitmap != null) {
                        Bitmap cloned = (Bitmap)bitmap.Clone();
                        this.BeginInvoke(new Action(() => {
                            picAttendanceFinger.Image?.Dispose();
                            picAttendanceFinger.Image = cloned;
                        }));
                    }
                } catch { }

                // 2. Extract features ONCE for verification
                DPFP.FeatureSet features = null;
                try {
                    var featureExtractor = new DPFP.Processing.FeatureExtraction();
                    var feedback = DPFP.Capture.CaptureFeedback.Good;
                    features = new DPFP.FeatureSet();
                    featureExtractor.CreateFeatureSet(sample, DPFP.Processing.DataPurpose.Verification, ref feedback, ref features);
                    
                    if (feedback != DPFP.Capture.CaptureFeedback.Good || features == null) {
                       UpdateAttendanceStatus("Poor Quality Scan. Try again.", Color.Orange);
                       _uiResetTimer?.Stop();
                       _uiResetTimer = new System.Windows.Forms.Timer { Interval = 2000 };
                       _uiResetTimer.Tick += (s, e) => { _uiResetTimer.Stop(); ResetAttendanceUI(); };
                       _uiResetTimer.Start();
                       return;
                    }
                } catch {
                    UpdateAttendanceStatus("Sensor Error. Clean and retry.", Color.Red);
                    _uiResetTimer?.Stop();
                    _uiResetTimer = new System.Windows.Forms.Timer { Interval = 2000 };
                    _uiResetTimer.Tick += (s, e) => { _uiResetTimer.Stop(); ResetAttendanceUI(); };
                    _uiResetTimer.Start();
                    return;
                }

                // 3. Update status to "Verifying..."
                UpdateAttendanceStatus("Verifying...", Color.Blue);

                // 4. Ultra-fast In-Memory Verification using immutable local snapshot
                var empsSnapshot = _attendanceEmployees;
                var tmplSnapshot = _cachedFingerprintTemplates;

                Employee matchedEmp = await Task.Run(() =>
                {
                    var verifier = new DPFP.Verification.Verification();

                    // Fast path: verify against pre-cached templates (takes < 10ms for 500+ employees)
                    foreach (var emp in empsSnapshot)
                    {
                        if (emp == null) continue;
                        if (tmplSnapshot.TryGetValue(emp._id, out var template))
                        {
                            try
                            {
                                var res = new DPFP.Verification.Verification.Result();
                                verifier.Verify(features, template, ref res);
                                if (res.Verified) return emp;
                            }
                            catch { }
                        }
                    }

                    // Fallback for newly added employees not yet in cache
                    foreach (var emp in empsSnapshot)
                    {
                        if (emp == null || string.IsNullOrEmpty(emp.fingerprintTemplate)) continue;
                        if (tmplSnapshot.ContainsKey(emp._id)) continue;

                        try
                        {
                            var template = new Template();
                            template.DeSerialize(Convert.FromBase64String(emp.fingerprintTemplate.Trim()));
                            var res = new DPFP.Verification.Verification.Result();
                            verifier.Verify(features, template, ref res);
                            if (res.Verified)
                            {
                                return emp;
                            }
                        }
                        catch { }
                    }

                    return (Employee)null;
                });

                if (matchedEmp != null) {
                    _consecutiveFingerFailures = 0;
                    UpdateAttendanceStatus("Match Found!", Color.Green);
                    await SendAttendanceToServer(matchedEmp);
                } else {
                    _consecutiveFingerFailures = 0;
                    UpdateAttendanceStatus("⚠️ Finger not recognized! Activating Face Backup...", Color.DarkOrange);
                    ShowNotFoundOnRightPanel();

                    // 1-Scan Instant Auto-Trigger Face Recognition Backup (300ms transition)
                    _uiResetTimer?.Stop();
                    _uiResetTimer = new System.Windows.Forms.Timer();
                    _uiResetTimer.Interval = 300;
                    _uiResetTimer.Tick += (s, e) => {
                        _uiResetTimer.Stop();
                        viewFaceAttendance.ResetCardToIdle();
                        viewFaceAttendance.ClearCameraFrame();
                        ShowView("face-attendance");
                        viewFaceAttendance.SetBackupMode(true, "⚡ FINGERPRINT UNVERIFIED — AUTO FACE BACKUP ACTIVE");
                    };
                    _uiResetTimer.Start();
                }
            }
            finally
            {
                Interlocked.Exchange(ref _scanProcessingLock, 0);
            }
        }

        /// <summary>Clears the right-side result panel without affecting the left scanner status.</summary>
        private void ClearRightPanel()
        {
            if (this.InvokeRequired) { this.BeginInvoke(new Action(ClearRightPanel)); return; }
            tblAttendanceRight.Visible = false;
            pnlAttendanceRightContent.BackColor = Color.White;
            lblWaitPlaceholder.Text = "SCANNING...";
            lblWaitPlaceholder.Visible = true;
            picSuccessProfile.Image = null;
            lblSuccessName.Visible = false;
            lblSuccessCode.Visible = false;
            lblSuccessStatus.Visible = false;
            lblSuccessTime.Visible = false;
        }

        /// <summary>Shows a clear "Finger Not Recognized - Switching to Face Backup" card.</summary>
        private void ShowNotFoundOnRightPanel()
        {
            if (this.InvokeRequired) { this.BeginInvoke(new Action(ShowNotFoundOnRightPanel)); return; }

            // Left label
            lblReadyToScan.Text = "FINGER NOT RECOGNIZED";
            lblReadyToScan.ForeColor = Color.DarkOrange;

            // Right panel — show warm orange Auto Face Fallback notice
            tblAttendanceRight.Visible = true;
            pnlAttendanceRightContent.BackColor = Color.FromArgb(255, 245, 230);
            lblWaitPlaceholder.Visible = false;

            lblSuccessStatus.Text = "FINGER UNVERIFIED";
            lblSuccessStatus.ForeColor = Color.OrangeRed;
            lblSuccessStatus.Visible = true;

            lblSuccessName.Text = "🔄 Auto-Switching to Face AI Backup...";
            lblSuccessName.ForeColor = Color.FromArgb(40, 40, 40);
            lblSuccessName.Visible = true;

            lblSuccessCode.Text = "Look into webcam to punch attendance";
            lblSuccessCode.ForeColor = Color.DarkSlateGray;
            lblSuccessCode.Visible = true;

            lblSuccessTime.Text = "Opening camera now...";
            lblSuccessTime.ForeColor = Color.DarkOrange;
            lblSuccessTime.Visible = true;

            picSuccessProfile.Image = null;
        }

        private void UpdateAttendanceStatus(string text, Color color)
        {
            if (this.InvokeRequired) { this.BeginInvoke(new Action(() => UpdateAttendanceStatus(text, color))); return; }
            lblReadyToScan.Text = text;
            lblReadyToScan.ForeColor = color;
        }

        private async Task SendAttendanceToServer(Employee emp)
        {
            try
            {
                string branch = _config.Branch; 
                
                var log = new BiometricLogRequest
                {
                    employeeCode = emp.code,
                    type = "FINGERPRINT",
                    timestamp = SafeNow,
                    branch = branch,
                    method = "FINGERPRINT"
                };

                using var req = new HttpRequestMessage(HttpMethod.Post, "api/v1/attendance/biometric")
                {
                    Content = JsonContent.Create(log)
                };

                if (!string.IsNullOrEmpty(_config.SecretKey))
                {
                    req.Headers.TryAddWithoutValidation("bas-secret-key", _config.SecretKey);
                }

                HttpResponseMessage response;
                try
                {
                    response = await _client.SendAsync(req);
                }
                catch
                {
                    // Network offline: save to durable offline outbox!
                    string photo = !string.IsNullOrEmpty(emp.photo) ? emp.photo : emp.profilePicture;
                    OfflinePunchQueue.Enqueue(emp.code, emp.name, branch, "FINGERPRINT", photo, DateTime.UtcNow);
                    ShowAttendanceSuccess(emp, "RECORDED OFFLINE", SafeNow.ToString("hh:mm:ss tt"), photo);
                    return;
                }

                BiometricResponse? result = null;
                try
                {
                    result = await response.Content.ReadFromJsonAsync<BiometricResponse>();
                }
                catch { }

                if (response.IsSuccessStatusCode && result != null && result.success)
                {
                    string actualType = result?.data?.action == "OUT" ? "Checked OUT" : "Checked IN";
                    
                    // Use the latest info from the server if available
                    string latestPhoto = result?.data?.photo ?? (!string.IsNullOrEmpty(emp.photo) ? emp.photo : emp.profilePicture);
                    
                    ShowAttendanceSuccess(emp, actualType, SafeNow.ToString("hh:mm:ss tt"), latestPhoto);
                }
                else
                {
                    string msg = result?.message ?? $"Server Error (HTTP {(int)response.StatusCode})";
                    ShowAttendanceError(emp, msg);
                }
            }
            catch (Exception ex)
            {
                // Fallback offline queue on critical failure
                try
                {
                    string photo = !string.IsNullOrEmpty(emp.photo) ? emp.photo : emp.profilePicture;
                    OfflinePunchQueue.Enqueue(emp.code, emp.name, _config?.Branch ?? "Main", "FINGERPRINT", photo, DateTime.UtcNow);
                    ShowAttendanceSuccess(emp, "RECORDED OFFLINE", SafeNow.ToString("hh:mm:ss tt"), photo);
                }
                catch { }
            }
        }

        private void ShowAttendanceSuccess(Employee emp, string status, string time, string latestPhoto = null)
        {
            if (this.InvokeRequired) { this.BeginInvoke(new Action(() => ShowAttendanceSuccess(emp, status, time, latestPhoto))); return; }
            
            lblReadyToScan.Text = "SCAN COMPLETED";
            lblReadyToScan.ForeColor = Color.Green;
            
            // UI Feedback - Premium Clean Look
            tblAttendanceRight.Visible = true;
            pnlAttendanceRightContent.BackColor = Color.White;
            lblWaitPlaceholder.Visible = false;
            
            // 1. Large Red Success Header
            // 1. Large Success Header (Green for IN, Red for OUT)
            bool isCheckIn = status == "Checked IN" || status == "RECORDED OFFLINE";
            lblSuccessStatus.Text = (status == "RECORDED OFFLINE" ? "SAVED OFFLINE" : (isCheckIn ? "CHECKED IN" : "CHECKED OUT")) + " SUCCESSFULLY";
            lblSuccessStatus.ForeColor = isCheckIn ? Color.Green : Color.Red;
            lblSuccessStatus.Visible = true;
            
            // 2. Employee Details Below
            lblSuccessName.Text = emp.name.ToUpper();
            lblSuccessName.ForeColor = Color.FromArgb(50, 50, 50);
            lblSuccessName.Visible = true;
            
            lblSuccessCode.Text = "Employee Code: " + emp.code;
            lblSuccessCode.ForeColor = Color.Gray;
            lblSuccessCode.Visible = true;
            
            lblSuccessTime.Text = "Transaction Time: " + time;
            lblSuccessTime.ForeColor = Color.Red;
            lblSuccessTime.Font = new Font("Segoe UI", 20f, FontStyle.Bold);
            lblSuccessTime.Visible = true;

            // Load Profile Picture
            string picField = !string.IsNullOrEmpty(latestPhoto) ? latestPhoto : (!string.IsNullOrEmpty(emp.photo) ? emp.photo : emp.profilePicture);
            LoadProfileImage(picField);

            // Reset after 2.0 seconds safely
            _uiResetTimer?.Stop();
            _uiResetTimer?.Dispose();
            _uiResetTimer = new System.Windows.Forms.Timer { Interval = 2000 };
            _uiResetTimer.Tick += (s, e) => { 
                _uiResetTimer?.Stop(); 
                _uiResetTimer?.Dispose();
                _uiResetTimer = null;
                ResetAttendanceUI(); 
            };
            _uiResetTimer.Start();
        }

        private void LoadProfileImage(string picField)
        {
            if (this.InvokeRequired) { this.BeginInvoke(new Action(() => LoadProfileImage(picField))); return; }

            if (string.IsNullOrWhiteSpace(picField))
            {
                picSuccessProfile.Image = null;
                return;
            }

            try
            {
                if (picField.StartsWith("data:image") || (!picField.StartsWith("http") && picField.Length > 100))
                {
                    // Base64 image
                    string base64Data = picField.Contains(",") ? picField.Substring(picField.IndexOf(",") + 1) : picField;
                    byte[] imageBytes = Convert.FromBase64String(base64Data.Trim());
                    using (var ms = new MemoryStream(imageBytes))
                    {
                        var bmp = new Bitmap(ms);
                        var old = picSuccessProfile.Image;
                        picSuccessProfile.Image = bmp;
                        old?.Dispose();
                    }
                }
                else if (picField.StartsWith("http"))
                {
                    picSuccessProfile.LoadAsync(picField);
                }
                else if (_config != null && !string.IsNullOrEmpty(_config.ServerUrl))
                {
                    string url = _config.ServerUrl.TrimEnd('/') + "/" + picField.TrimStart('/');
                    picSuccessProfile.LoadAsync(url);
                }
                else
                {
                    picSuccessProfile.Image = null;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("Error loading profile image: " + ex.Message);
                picSuccessProfile.Image = null;
            }
        }



        private void btnOpenEnrollment_Click(object sender, EventArgs e)
        {
            if (cmbRegEmployees.SelectedValue == null)
            {
                MessageBox.Show("Please select an employee first.");
                return;
            }

            string empId = cmbRegEmployees.SelectedValue.ToString();
            string empName = cmbRegEmployees.Text;

            // Stop attendance capturer before opening enrollment to avoid conflict
            _capturer?.StopCapture();

            using (var enrollForm = new EnrollmentForm(empId, empName, _config.SecretKey, _client, _cachedFingerprintTemplates, _registrationEmployees))
            {
                if (enrollForm.ShowDialog() == DialogResult.OK)
                {
                    lblRegStatus.Text = $"COMPLETED: {empName} registered successfully.";
                    lblRegStatus.ForeColor = Color.DarkGreen;
                    
                    // CRITICAL: Sync immediately so the new fingerprint works right away!
                    _ = SyncAllEmployees();
                }
            }

            // Resume attendance capturer
            _capturer?.StartCapture();
        }

        private async Task ProcessManualAttendance(Employee emp)
        {
            try {
                // Update UI to show we are syncing
                UpdateAttendanceStatus("MANUAL TESTING: SYNCING...", Color.Blue);
                await SendAttendanceToServer(emp);
            }
            catch (Exception ex) {
                ShowAttendanceError(emp, "Error: " + ex.Message);
            }
        }

        private async void btnManualCheck_Click(object sender, EventArgs e)
        {
            MessageBox.Show("Manual attendance entry without biometric verification is disabled in production.", "Security Notice", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            await Task.CompletedTask;
            return;
        }


        private void UpdateLiveClock(object sender, EventArgs e)
        {
            try
            {
                lblLiveDateTime.Text = SafeNow.ToString("dd MMM yyyy hh:mm:ss tt");
                if (lblLiveDateTime.Text.Contains("1970")) lblLiveDateTime.Text = "Time Init Error (Win7 Bug)";
            }
            catch (Exception ex)
            {
                // On some broken Win7 systems, DateTime.Now throws if TimeZone data is corrupt or DLLs missing
                lblLiveDateTime.Text = "System Time Unavailable";
                Console.WriteLine("Safe Clock Error: " + ex.Message);
            }
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            base.OnFormClosing(e);
            try
            {
                if (_capturer != null)
                {
                    _capturer.StopCapture();
                    _capturer.EventHandler = null;
                    _capturer.Dispose();
                    _capturer = null;
                }
            }
            catch { }
        }

    }
}
