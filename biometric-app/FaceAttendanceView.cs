using System;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace BiometricApp
{
    public class FaceAttendanceView : UserControl
    {
        private HttpClient _client;
        private Config _config;
        private CameraManager _cameraManager;
        private FaceEngine _faceEngine;
        private List<FaceEmployeeDto> _enrolledEmployees = new List<FaceEmployeeDto>();
        private readonly object _employeesLock = new object();

        // Debounce & Gating to prevent rapid duplicate punches and concurrent frame collision
        private readonly ConcurrentDictionary<string, DateTime> _punchCooldowns = new ConcurrentDictionary<string, DateTime>();
        private readonly ConcurrentDictionary<string, string> _lastPunchStatus = new ConcurrentDictionary<string, string>();
        private readonly ConcurrentDictionary<string, byte> _activePunchingEmployees = new ConcurrentDictionary<string, byte>();
        private readonly TimeSpan COOLDOWN_DURATION = TimeSpan.FromSeconds(20);

        public void ClearCooldowns()
        {
            _punchCooldowns.Clear();
            _lastPunchStatus.Clear();
            _activePunchingEmployees.Clear();
        }

        private bool _isShowingResultCard = false;
        private bool _isBackupMode = false;
        private FaceEmployeeDto? _lastPunchedEmployee = null;
        private System.Windows.Forms.Timer? _backupTimeoutTimer;
        private System.Windows.Forms.Timer? _autoReturnTimer;
        private System.Windows.Forms.Timer? _offlineSyncTimer;
        private DateTime? _unrecognizedFaceStartTime = null;
        private long _avatarLoadGeneration = 0;

        // Temporal Multi-Frame Identity Confirmation State (Anti-FAR)
        private string? _consecutiveCandidateCode = null;
        private int _consecutiveMatchCount = 0;
        private const int REQUIRED_CONSECUTIVE_FRAMES = 2;

        public event Action AttendancePunchedSuccessfully;
        public event Action BackToFingerprintRequested;

        private void SafeBeginInvoke(Action action)
        {
            if (this.IsDisposed || !this.IsHandleCreated) return;
            try
            {
                this.BeginInvoke(action);
            }
            catch (ObjectDisposedException) { }
            catch (InvalidOperationException) { }
        }

        // UI Controls
        private Panel pnlHeader;
        private Label lblTitle;
        private Label lblClock;
        private ComboBox cmbCameras;
        private Button btnRefreshCameras;
        private Label lblCameraSelect;
        private Button btnBackToFingerprint;

        private TableLayoutPanel tblMain;
        private Panel pnlCameraContainer;
        private PictureBox picVideo;
        private Panel pnlStatusCard;

        private PictureBox picEmployeeAvatar;
        private Label lblEmpName;
        private Label lblEmpCode;
        private Label lblPunchStatus;
        private Label lblPunchTime;
        private Label lblRemarksDetail;
        private Label lblVerificationBadge;
        private Label lblInstruction;
        private System.Windows.Forms.Timer _resetCardTimer;
        private System.Windows.Forms.Timer _clockTimer;

        // HUD Overlay State
        private FaceDetectionResult _lastFaceResult;
        private DateTime _lastFaceTime;
        private bool _isPopulatingCameras = false;
        private volatile bool _isRenderingFrame = false;

        public FaceAttendanceView()
        {
            InitializeComponent();
            _cameraManager = new CameraManager();
            _faceEngine = new FaceEngine();
            _cameraManager.NewFrameReceived += OnCameraFrame;
        }

        public void Initialize(HttpClient client, Config config)
        {
            _client = client;
            _config = config;

            LoadCameras(false);
            _ = LoadEnrolledEmployees();

            Form1.UsbDeviceChanged += OnUsbDeviceChanged;

            // Periodic offline outbox synchronization (every 15s)
            _offlineSyncTimer?.Stop();
            _offlineSyncTimer?.Dispose();
            _offlineSyncTimer = new System.Windows.Forms.Timer { Interval = 15000 };
            _offlineSyncTimer.Tick += async (s, e) =>
            {
                try
                {
                    if (_client != null && _config != null && OfflinePunchQueue.GetPendingCount() > 0)
                    {
                        await OfflinePunchQueue.SyncPendingPunchesAsync(_client, _config);
                    }
                }
                catch { }
            };
            _offlineSyncTimer.Start();
        }

        private void OnUsbDeviceChanged()
        {
            SafeBeginInvoke(() => LoadCameras(preserveSelection: false));
        }

        private void InitializeComponent()
        {
            this.BackColor = Color.FromArgb(20, 24, 28);
            this.Dock = DockStyle.Fill;

            // 1. Header Bar
            pnlHeader = new Panel
            {
                Dock = DockStyle.Top,
                Height = 60,
                BackColor = Color.FromArgb(28, 32, 38),
                Padding = new Padding(15, 10, 15, 10)
            };

            lblTitle = new Label
            {
                Text = "📸 BAS AI LIVE FACE ATTENDANCE",
                Font = new Font("Segoe UI", 13F, FontStyle.Bold),
                ForeColor = Color.FromArgb(0, 210, 255),
                AutoSize = true,
                Location = new Point(15, 15)
            };

            lblCameraSelect = new Label
            {
                Text = "Camera:",
                Font = new Font("Segoe UI", 9F, FontStyle.Bold),
                ForeColor = Color.LightGray,
                AutoSize = true,
                Location = new Point(340, 20)
            };

            cmbCameras = new ComboBox
            {
                DropDownStyle = ComboBoxStyle.DropDownList,
                Width = 220,
                Location = new Point(405, 16),
                Font = new Font("Segoe UI", 9F)
            };
            cmbCameras.SelectedIndexChanged += (s, e) => SwitchCamera();

            btnRefreshCameras = new Button
            {
                Text = "🔄",
                Font = new Font("Segoe UI", 9F, FontStyle.Bold),
                Location = new Point(630, 15),
                Size = new Size(32, 27),
                BackColor = Color.FromArgb(45, 55, 75),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Cursor = Cursors.Hand
            };
            btnRefreshCameras.FlatAppearance.BorderSize = 0;
            btnRefreshCameras.Click += (s, e) => {
                LoadCameras(false);
                MessageBox.Show($"Camera scan complete.\nFound {cmbCameras.Items.Count} active video device(s).", "Cameras Refreshed", MessageBoxButtons.OK, MessageBoxIcon.Information);
            };

            lblClock = new Label
            {
                Font = new Font("Segoe UI", 11F, FontStyle.Bold),
                ForeColor = Color.FromArgb(16, 185, 129),
                AutoSize = true,
                Location = new Point(675, 18)
            };

            btnBackToFingerprint = new Button
            {
                Text = "👈 Back to Fingerprint",
                Font = new Font("Segoe UI", 9F, FontStyle.Bold),
                ForeColor = Color.White,
                BackColor = Color.FromArgb(50, 75, 120),
                FlatStyle = FlatStyle.Flat,
                Size = new Size(180, 34),
                Location = new Point(1000, 13),
                Anchor = AnchorStyles.Top | AnchorStyles.Right,
                Cursor = Cursors.Hand
            };
            btnBackToFingerprint.FlatAppearance.BorderSize = 0;
            btnBackToFingerprint.Click += (s, e) =>
            {
                _backupTimeoutTimer?.Stop();
                BackToFingerprintRequested?.Invoke();
            };

            pnlHeader.Controls.Add(lblTitle);
            pnlHeader.Controls.Add(lblCameraSelect);
            pnlHeader.Controls.Add(cmbCameras);
            pnlHeader.Controls.Add(btnRefreshCameras);
            pnlHeader.Controls.Add(lblClock);
            pnlHeader.Controls.Add(btnBackToFingerprint);

            // 2. Main Layout (55% Camera, 45% Punch Card)
            tblMain = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 2,
                RowCount = 1,
                Padding = new Padding(15)
            };
            tblMain.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 58F));
            tblMain.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 42F));

            // Camera Container
            pnlCameraContainer = new Panel
            {
                Dock = DockStyle.Fill,
                BackColor = Color.FromArgb(10, 12, 14),
                Padding = new Padding(5)
            };

            picVideo = new PictureBox
            {
                Dock = DockStyle.Fill,
                SizeMode = PictureBoxSizeMode.Zoom,
                BackColor = Color.Black
            };
            pnlCameraContainer.Controls.Add(picVideo);

            // Punch Status Card (Right Panel) - Premium Remarks Display
            pnlStatusCard = new Panel
            {
                Dock = DockStyle.Fill,
                BackColor = Color.FromArgb(24, 28, 34),
                Padding = new Padding(20)
            };

            lblInstruction = new Label
            {
                Text = "👀 Please look directly at the camera to punch attendance",
                Font = new Font("Segoe UI", 10.5F, FontStyle.Regular),
                ForeColor = Color.DarkGray,
                TextAlign = ContentAlignment.MiddleCenter,
                Dock = DockStyle.Top,
                Height = 35
            };

            picEmployeeAvatar = new PictureBox
            {
                Width = 155,
                Height = 155,
                SizeMode = PictureBoxSizeMode.Zoom,
                BorderStyle = BorderStyle.FixedSingle,
                BackColor = Color.FromArgb(35, 40, 48),
                Location = new Point(125, 45)
            };

            lblEmpName = new Label
            {
                Text = "Waiting for Employee...",
                Font = new Font("Segoe UI", 15F, FontStyle.Bold),
                ForeColor = Color.White,
                TextAlign = ContentAlignment.MiddleCenter,
                Location = new Point(15, 212),
                Width = 375,
                Height = 32
            };

            lblEmpCode = new Label
            {
                Text = "Code: --",
                Font = new Font("Segoe UI", 10.5F, FontStyle.Regular),
                ForeColor = Color.LightGray,
                TextAlign = ContentAlignment.MiddleCenter,
                Location = new Point(15, 246),
                Width = 375,
                Height = 24
            };

            // Large, High-Visibility Status Badge (Height 55, Font 16pt Bold)
            lblPunchStatus = new Label
            {
                Text = "READY TO SCAN",
                Font = new Font("Segoe UI", 16F, FontStyle.Bold),
                ForeColor = Color.FromArgb(0, 210, 255),
                TextAlign = ContentAlignment.MiddleCenter,
                Location = new Point(20, 278),
                Width = 365,
                Height = 55,
                BackColor = Color.FromArgb(35, 40, 48),
                Cursor = Cursors.Hand
            };
            lblPunchStatus.Click += (s, e) => {
                ClearCooldowns();
                ResetCardToIdle();
            };

            // 12-Hour Punch Time Display (Font 13pt Bold)
            lblPunchTime = new Label
            {
                Text = "",
                Font = new Font("Segoe UI", 13F, FontStyle.Bold),
                ForeColor = Color.FromArgb(16, 185, 129),
                TextAlign = ContentAlignment.MiddleCenter,
                Location = new Point(15, 342),
                Width = 375,
                Height = 28
            };

            // Detailed Remarks Message
            lblRemarksDetail = new Label
            {
                Text = "",
                Font = new Font("Segoe UI", 10.5F, FontStyle.Regular),
                ForeColor = Color.FromArgb(200, 205, 215),
                TextAlign = ContentAlignment.MiddleCenter,
                Location = new Point(15, 374),
                Width = 375,
                Height = 26
            };

            lblVerificationBadge = new Label
            {
                Text = "📸 VERIFIED VIA LIVE FACE AI",
                Font = new Font("Segoe UI", 9F, FontStyle.Bold),
                ForeColor = Color.Cyan,
                TextAlign = ContentAlignment.MiddleCenter,
                Location = new Point(15, 404),
                Width = 375,
                Height = 22,
                Visible = false
            };

            pnlStatusCard.Resize += (s, e) =>
            {
                int cardW = pnlStatusCard.Width;
                picEmployeeAvatar.Left = Math.Max(10, (cardW - picEmployeeAvatar.Width) / 2);
                lblEmpName.Width = cardW - 30;
                lblEmpCode.Width = cardW - 30;
                lblPunchStatus.Width = Math.Max(100, cardW - 40);
                lblPunchStatus.Left = 20;
                lblPunchTime.Width = cardW - 30;
                lblRemarksDetail.Width = cardW - 30;
                lblVerificationBadge.Width = cardW - 30;
            };

            pnlStatusCard.Controls.Add(lblInstruction);
            pnlStatusCard.Controls.Add(picEmployeeAvatar);
            pnlStatusCard.Controls.Add(lblEmpName);
            pnlStatusCard.Controls.Add(lblEmpCode);
            pnlStatusCard.Controls.Add(lblPunchStatus);
            pnlStatusCard.Controls.Add(lblPunchTime);
            pnlStatusCard.Controls.Add(lblRemarksDetail);
            pnlStatusCard.Controls.Add(lblVerificationBadge);

            tblMain.Controls.Add(pnlCameraContainer, 0, 0);
            tblMain.Controls.Add(pnlStatusCard, 1, 0);

            this.Controls.Add(tblMain);
            this.Controls.Add(pnlHeader);

            // Timers
            _clockTimer = new System.Windows.Forms.Timer { Interval = 1000 };
            _clockTimer.Tick += (s, e) => UpdateClock();
            _clockTimer.Start();

            _resetCardTimer = new System.Windows.Forms.Timer { Interval = 4000 };
            _resetCardTimer.Tick += (s, e) => ResetCardToIdle();
        }

        private void UpdateClock()
        {
            DateTime now = DateTime.Now;
            lblClock.Text = $"{now:hh:mm:ss tt} PKT | {now:dddd, dd MMM yyyy}";
        }

        public void LoadCameras(bool preserveSelection = true)
        {
            if (_isPopulatingCameras) return;
            _isPopulatingCameras = true;
            try
            {
                int prevIndex = -1;
                if (preserveSelection && cmbCameras.SelectedItem is CameraDevice prevDev)
                {
                    prevIndex = prevDev.Index;
                }

                cmbCameras.BeginUpdate();
                cmbCameras.Items.Clear();
                var cameras = CameraManager.GetAvailableCameras();
                CameraDevice? match = null;
                foreach (var cam in cameras)
                {
                    cmbCameras.Items.Add(cam);
                    if (cam.Index == prevIndex) match = cam;
                }

                // If not preserved or not found, prioritize external USB camera if connected
                if (match == null && cmbCameras.Items.Count > 0)
                {
                    match = cameras.Find(c => c.IsExternal) ?? (CameraDevice)cmbCameras.Items[0];
                }

                if (match != null)
                {
                    cmbCameras.SelectedItem = match;
                }
                cmbCameras.EndUpdate();
            }
            catch (Exception ex)
            {
                Console.WriteLine("LoadCameras error: " + ex.Message);
            }
            finally
            {
                _isPopulatingCameras = false;
            }
        }

        public void StartCamera()
        {
            ClearCooldowns();
            ResetCardToIdle();
            ClearCameraFrame();
            if (cmbCameras.SelectedItem is CameraDevice dev)
            {
                _cameraManager.Start(dev.Index);
            }
            else
            {
                _cameraManager.Start(0);
            }
        }

        public void StopCamera()
        {
            _backupTimeoutTimer?.Stop();
            _autoReturnTimer?.Stop();
            _autoReturnTimer?.Dispose();
            _autoReturnTimer = null;
            _isShowingResultCard = false;
            _unrecognizedFaceStartTime = null;
            _faceEngine?.ResetTracking();
            _cameraManager.Stop();
            ResetCardToIdle();
            ClearCameraFrame();
        }

        private void SwitchCamera()
        {
            if (_isPopulatingCameras) return;
            if (this.Visible && cmbCameras.SelectedItem is CameraDevice dev)
            {
                if (dev.Index == _cameraManager.CurrentCameraIndex && _cameraManager.IsRunning) return;
                _faceEngine?.ResetTracking();
                _cameraManager.Start(dev.Index);
            }
        }

        public void SetBackupMode(bool isBackup, string customInstruction = null)
        {
            _isBackupMode = isBackup;
            ClearCooldowns();
            if (this.InvokeRequired)
            {
                this.Invoke(new Action(() => SetBackupMode(isBackup, customInstruction)));
                return;
            }

            ResetCardToIdle();

            if (isBackup)
            {
                lblTitle.Text = "⚡ DUAL BIOMETRIC: FACE BACKUP ACTIVE";
                lblTitle.ForeColor = Color.Orange;
                lblInstruction.Text = customInstruction ?? "⚡ DUAL BACKUP: Fingerprint unverified — Look at camera to verify face";
                lblInstruction.ForeColor = Color.Yellow;
                lblVerificationBadge.Text = "⚡ VERIFIED VIA FACE BACKUP";

                // Auto-timeout after 10 seconds if nobody looks at camera
                _backupTimeoutTimer?.Stop();
                _backupTimeoutTimer = new System.Windows.Forms.Timer { Interval = 10000 };
                _backupTimeoutTimer.Tick += (s, e) =>
                {
                    _backupTimeoutTimer.Stop();
                    BackToFingerprintRequested?.Invoke();
                };
                _backupTimeoutTimer.Start();
            }
            else
            {
                _backupTimeoutTimer?.Stop();
                lblTitle.Text = "📸 BAS AI LIVE FACE ATTENDANCE";
                lblTitle.ForeColor = Color.FromArgb(0, 210, 255);
                int count = _enrolledEmployees?.Count ?? 0;
                lblInstruction.Text = count > 0 
                    ? $"👀 Look at camera to punch attendance ({count} face(s) enrolled)" 
                    : "⚠️ No face templates registered. Please enroll in 'Face AI Register'.";
                lblInstruction.ForeColor = count > 0 ? Color.DarkGray : Color.Orange;
                lblVerificationBadge.Text = "📸 VERIFIED VIA LIVE FACE AI";
            }
        }

        public async Task LoadEnrolledEmployees()
        {
            try
            {
                // Fetch fresh authoritative data directly from Live Cloud Database API (NO local storage)
                if (_client != null && _config != null)
                {
                    try
                    {
                        string url = "api/v1/attendance/biometric/face/descriptors?branch=All";
                        using var req = new HttpRequestMessage(HttpMethod.Get, url);
                        if (!string.IsNullOrEmpty(_config.SecretKey))
                        {
                            req.Headers.TryAddWithoutValidation("bas-secret-key", _config.SecretKey);
                        }
                        using var resp = await _client.SendAsync(req);
                        if (resp.IsSuccessStatusCode)
                        {
                            var result = await resp.Content.ReadFromJsonAsync<FaceDescriptorsResponse>();
                            if (result != null && result.success && result.data != null)
                            {
                                lock (_employeesLock)
                                {
                                    _enrolledEmployees = new List<FaceEmployeeDto>(result.data);
                                }
                                SafeBeginInvoke(() => UpdateEnrolledUI(_enrolledEmployees.Count));
                                return; // 100% loaded directly from Live Database
                            }
                        }
                        else
                        {
                            Console.WriteLine($"Server returned status: {resp.StatusCode}");
                        }
                    }
                    catch (Exception netEx)
                    {
                        Console.WriteLine("Cloud fetch error: " + netEx.Message);
                    }
                }

                // If database failed to respond, do NOT load fake/local data. Show live server error!
                SafeBeginInvoke(() =>
                {
                    lblEmpName.Text = "Database Offline";
                    lblEmpCode.Text = "Cannot reach central database";
                    lblPunchStatus.Text = "⚠️ SERVER OFFLINE";
                    lblPunchStatus.BackColor = Color.FromArgb(100, 30, 30);
                    lblInstruction.Text = "⚠️ Unable to load face records from live database. Please check connection.";
                    lblInstruction.ForeColor = Color.OrangeRed;
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine("Error loading face descriptors: " + ex.Message);
            }
        }

        private void UpdateEnrolledUI(int count)
        {
            ResetCardToIdle();
            if (count > 0)
            {
                if (!_isBackupMode)
                {
                    lblInstruction.Text = $"👀 Look at camera to punch attendance ({count} face(s) enrolled)";
                    lblInstruction.ForeColor = Color.DarkGray;
                }
            }
            else
            {
                lblEmpName.Text = "No Enrolled Faces";
                lblEmpCode.Text = "Please enroll face in Face AI Register";
                lblPunchStatus.Text = "⚠️ 0 FACES ENROLLED";
                lblPunchStatus.BackColor = Color.FromArgb(100, 60, 20);
                lblInstruction.Text = "⚠️ Please register your face first in 'Face AI Register'";
                lblInstruction.ForeColor = Color.Orange;
            }
        }

        private void OnCameraFrame(Bitmap frame)
        {
            if (this.IsDisposed || !this.Visible || _isRenderingFrame)
            {
                frame.Dispose();
                return;
            }

            _isRenderingFrame = true;

            try
            {
                // Run trained computer-vision detection on incoming frame
                var detected = _faceEngine.ProcessFrame(frame);
                FaceDetectionResult? bestFace = null;
                if (detected.Count > 0)
                {
                    bestFace = detected[0];
                    _lastFaceResult = bestFace;
                    _lastFaceTime = DateTime.Now;

                    // If user is actively standing in front of camera in backup mode, keep extending timer
                    if (_isBackupMode && _backupTimeoutTimer != null && _backupTimeoutTimer.Enabled)
                    {
                        _backupTimeoutTimer.Stop();
                        _backupTimeoutTimer.Start();
                    }

                    // Match against local enrolled employee vector cache
                    if (bestFace.IsLive && bestFace.IsRecognized)
                    {
                        TryMatchAndPunch(bestFace);
                    }
                }
                else
                {
                    _unrecognizedFaceStartTime = null;
                    // When no result card is showing, reset any scanning text to idle if face walks away
                    if ((DateTime.Now - _lastFaceTime).TotalSeconds > 1.0 && !_isShowingResultCard)
                    {
                        SafeBeginInvoke(ResetCardToIdle);
                    }
                }

                // Render annotated frame (camera feed + reticle + 5 landmarks + pose banner) directly onto bitmap
                Bitmap displayBitmap = RenderAnnotatedFrame(frame, bestFace);
                frame.Dispose();

                // Swap image onto PictureBox safely without Paint-event race conditions
                SafeBeginInvoke(() =>
                {
                    try
                    {
                        if (this.IsDisposed || !this.Visible)
                        {
                            displayBitmap.Dispose();
                            return;
                        }

                        var old = picVideo.Image;
                        picVideo.Image = displayBitmap;
                        old?.Dispose();
                    }
                    catch { }
                    finally
                    {
                        _isRenderingFrame = false;
                    }
                });
            }
            catch
            {
                _isRenderingFrame = false;
                frame.Dispose();
            }
        }

        private Bitmap RenderAnnotatedFrame(Bitmap original, FaceDetectionResult? face)
        {
            var output = new Bitmap(original.Width, original.Height);
            using (var g = Graphics.FromImage(output))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;

                // Draw live camera feed
                g.DrawImage(original, 0, 0, original.Width, original.Height);

                if (face != null)
                {
                    var r = face.BoundingBox;
                    Color reticleColor = face.IsLive ? Color.FromArgb(16, 185, 129) : Color.Red;

                    // Draw Holographic Corner Brackets around Face
                    using (var pen = new Pen(reticleColor, 3.5f))
                    {
                        int cornerLen = Math.Min(35, Math.Max(15, r.Width / 4));

                        // Top-Left
                        g.DrawLine(pen, r.X, r.Y, r.X + cornerLen, r.Y);
                        g.DrawLine(pen, r.X, r.Y, r.X, r.Y + cornerLen);

                        // Top-Right
                        g.DrawLine(pen, r.Right, r.Y, r.Right - cornerLen, r.Y);
                        g.DrawLine(pen, r.Right, r.Y, r.Right, r.Y + cornerLen);

                        // Bottom-Left
                        g.DrawLine(pen, r.X, r.Bottom, r.X + cornerLen, r.Bottom);
                        g.DrawLine(pen, r.X, r.Bottom, r.X, r.Bottom - cornerLen);

                        // Bottom-Right
                        g.DrawLine(pen, r.Right, r.Bottom, r.Right - cornerLen, r.Bottom);
                        g.DrawLine(pen, r.Right, r.Bottom, r.Right, r.Bottom - cornerLen);
                    }

                    // Draw 5 Trained Landmarks (YuNet)
                    if (face.HasLandmarks && face.Landmarks != null)
                    {
                        Color[] lmColors = new Color[]
                        {
                            Color.FromArgb(0, 255, 255), // Right Eye (Cyan)
                            Color.FromArgb(0, 255, 255), // Left Eye (Cyan)
                            Color.FromArgb(255, 215, 0), // Nose (Gold)
                            Color.FromArgb(255, 80, 220), // Right Mouth (Magenta)
                            Color.FromArgb(255, 80, 220)  // Left Mouth (Magenta)
                        };

                        for (int i = 0; i < 5 && i < face.Landmarks.Length; i++)
                        {
                            using var brush = new SolidBrush(lmColors[i]);
                            g.FillEllipse(brush, face.Landmarks[i].X - 4f, face.Landmarks[i].Y - 4f, 8f, 8f);
                        }
                    }

                    // Pose and Head Orientation Banner
                    string bannerText = face.IsLive ? $"🟢 {face.PoseLabel}" : "⛔ FAKE PHOTO REJECTED";
                    using (var font = new Font("Segoe UI", 11F, FontStyle.Bold))
                    using (var brush = new SolidBrush(reticleColor))
                    using (var bgBrush = new SolidBrush(Color.FromArgb(190, 15, 18, 24)))
                    {
                        var size = g.MeasureString(bannerText, font);
                        float bannerX = r.X;
                        float bannerY = Math.Max(8, r.Y - size.Height - 6);
                        g.FillRectangle(bgBrush, bannerX, bannerY, size.Width + 10, size.Height + 4);
                        g.DrawString(bannerText, font, brush, bannerX + 5, bannerY + 2);
                    }
                }
            }
            return output;
        }

        private void TryMatchAndPunch(FaceDetectionResult result)
        {
            List<FaceEmployeeDto> snapshot;
            lock (_employeesLock)
            {
                snapshot = new List<FaceEmployeeDto>(_enrolledEmployees);
            }

            if (snapshot.Count == 0)
            {
                SafeBeginInvoke(() =>
                {
                    if (_isShowingResultCard) return;
                    _isShowingResultCard = true;
                    lblEmpName.Text = "No Enrolled Faces";
                    lblEmpCode.Text = "Please enroll face in Face AI Register";
                    lblPunchStatus.Text = "⚠️ 0 FACES ENROLLED";
                    lblPunchStatus.BackColor = Color.FromArgb(100, 60, 20);

                    if (_isBackupMode)
                    {
                        _autoReturnTimer?.Stop();
                        _autoReturnTimer?.Dispose();
                        _autoReturnTimer = new System.Windows.Forms.Timer { Interval = 2000 };
                        _autoReturnTimer.Tick += (s, e) =>
                        {
                            _autoReturnTimer?.Stop();
                            _autoReturnTimer?.Dispose();
                            _autoReturnTimer = null;
                            _isShowingResultCard = false;
                            ResetCardToIdle();
                            ClearCameraFrame();
                            BackToFingerprintRequested?.Invoke();
                        };
                        _autoReturnTimer.Start();
                    }
                });
                return;
            }

            if (result.Embedding == null || result.Embedding.Count != 128) return;

            // Fail-closed liveness check
            if (!result.IsLive) return;

            FaceEmployeeDto? bestMatch = null;
            float highestSimilarity = 0f;
            float secondHighestSimilarity = 0f;

            foreach (var emp in snapshot)
            {
                if (emp.faceTemplate != null && emp.faceTemplate.Count == 128)
                {
                    float sim = FaceEngine.ComputeCosineSimilarity(result.Embedding, emp.faceTemplate);
                    if (sim > highestSimilarity)
                    {
                        secondHighestSimilarity = highestSimilarity;
                        highestSimilarity = sim;
                        bestMatch = emp;
                    }
                    else if (sim > secondHighestSimilarity)
                    {
                        secondHighestSimilarity = sim;
                    }
                }
            }

            // Calibrated SFace 128-D cosine similarity threshold
            // True matches: 0.50 - 0.85. Different-person cross-match ceiling: 0.38.
            const float matchThreshold = 0.45f;
            const float minRunnerUpMargin = 0.06f;

            // Reject ambiguous matches where runner-up is too close to top candidate
            bool isAmbiguous = (secondHighestSimilarity >= 0.38f && (highestSimilarity - secondHighestSimilarity) < minRunnerUpMargin);

            if (highestSimilarity >= matchThreshold && bestMatch != null && !isAmbiguous)
            {
                // Multi-frame streak confirmation: must see the same employee across REQUIRED_CONSECUTIVE_FRAMES
                if (_consecutiveCandidateCode == bestMatch.code)
                {
                    _consecutiveMatchCount++;
                }
                else
                {
                    _consecutiveCandidateCode = bestMatch.code;
                    _consecutiveMatchCount = 1;
                }

                if (_consecutiveMatchCount < REQUIRED_CONSECUTIVE_FRAMES)
                {
                    SafeBeginInvoke(() =>
                    {
                        if (!_isShowingResultCard)
                        {
                            lblPunchStatus.Text = $"VERIFYING ({_consecutiveMatchCount}/{REQUIRED_CONSECUTIVE_FRAMES})...";
                            lblPunchStatus.BackColor = Color.FromArgb(40, 50, 65);
                            lblPunchStatus.ForeColor = Color.Cyan;
                            lblPunchStatus.Font = new Font("Segoe UI", 16F, FontStyle.Bold);
                            lblEmpName.Text = bestMatch.name;
                            lblEmpName.ForeColor = Color.White;
                            lblEmpCode.Text = $"Code: {bestMatch.code} • Confirming ({highestSimilarity * 100:F0}%)";
                            lblEmpCode.ForeColor = Color.FromArgb(0, 210, 255);
                        }
                    });
                    return; // Wait for full consecutive streak before recording punch
                }
                // CRITICAL 1-SHOT GUARD:
                // If a punch result card is currently showing for this employee, DO NOT restart the timer
                // or re-trigger ShowPunchResult on incoming camera frames.
                // Allow the 2-second auto-return countdown to complete without interruption and return to biometric screen!
                if (_isShowingResultCard && _lastPunchedEmployee?.code == bestMatch.code)
                {
                    return;
                }

                // PREEMPTIVE SMART SWITCHING:
                // If a new employee approaches while previous result card is showing, immediately dismiss previous card!
                if (_isShowingResultCard && _lastPunchedEmployee?.code != bestMatch.code)
                {
                    _autoReturnTimer?.Stop();
                    _autoReturnTimer?.Dispose();
                    _autoReturnTimer = null;
                    _isShowingResultCard = false;
                }

                // Check debounce
                if (_punchCooldowns.TryGetValue(bestMatch.code, out DateTime lastPunch))
                {
                    if ((DateTime.Now - lastPunch) < COOLDOWN_DURATION)
                    {
                        string status = "ALREADY RECORDED";
                        string remarks = "⚠️ You have already marked attendance recently.";
                        Color color = Color.FromArgb(234, 88, 12);

                        if (_lastPunchStatus.TryGetValue(bestMatch.code, out string? lastAct))
                        {
                            if (lastAct == "OUT")
                            {
                                status = "ALREADY CHECKED OUT";
                                remarks = "⚠️ You have already Checked OUT for today.";
                                color = Color.FromArgb(234, 88, 12);
                            }
                            else if (lastAct == "IN")
                            {
                                status = "ALREADY CHECKED IN";
                                remarks = "⚠️ You have already Checked IN today.";
                                color = Color.FromArgb(16, 185, 129);
                            }
                        }

                        SafeBeginInvoke(() =>
                        {
                            ShowPunchResult(
                                emp: bestMatch,
                                statusText: status,
                                statusColor: color,
                                timeText: $"Transaction Time: {lastPunch:hh:mm:ss tt}",
                                remarksDetail: remarks,
                                photoData: bestMatch.photo
                            );
                        });
                        return;
                    }
                }

                // Atomic gate: prevent duplicate concurrent in-flight punch for the same employee
                if (!_activePunchingEmployees.TryAdd(bestMatch.code, 1)) return;

                // Stop backup timeout timer immediately upon verified match
                _backupTimeoutTimer?.Stop();
                _unrecognizedFaceStartTime = null;

                // Execute attendance punch asynchronously
                _ = ExecuteAttendancePunch(bestMatch);
            }
            else if (bestMatch != null && highestSimilarity > 0.25f)
            {
                _consecutiveCandidateCode = null;
                _consecutiveMatchCount = 0;
                _unrecognizedFaceStartTime = null;
                SafeBeginInvoke(() =>
                {
                    if (_isShowingResultCard) return; // Do not overwrite punch result card
                    lblEmpName.Text = "Scanning Face...";
                    lblEmpName.ForeColor = Color.White;
                    lblEmpCode.Text = $"Aligning with camera ({highestSimilarity * 100:F0}%)";
                    lblEmpCode.ForeColor = Color.Gray;
                    lblPunchStatus.Text = "ALIGNING FACE...";
                    lblPunchStatus.BackColor = Color.FromArgb(40, 50, 65);
                    lblPunchStatus.ForeColor = Color.Cyan;
                    lblPunchStatus.Font = new Font("Segoe UI", 16F, FontStyle.Bold);
                    lblPunchTime.Text = "";
                    lblRemarksDetail.Text = "Please look steady at the camera";
                    lblRemarksDetail.ForeColor = Color.FromArgb(200, 210, 225);
                    lblRemarksDetail.Visible = true;
                    lblVerificationBadge.Visible = false;

                    var oldImg = picEmployeeAvatar.Image;
                    picEmployeeAvatar.Image = null;
                    oldImg?.Dispose();
                });
            }
            else
            {
                _consecutiveCandidateCode = null;
                _consecutiveMatchCount = 0;
                // Face detected in camera, but similarity <= 0.25f
                if (_unrecognizedFaceStartTime == null)
                {
                    _unrecognizedFaceStartTime = DateTime.Now;
                }

                double elapsed = (DateTime.Now - _unrecognizedFaceStartTime.Value).TotalSeconds;
                if (elapsed < 1.0)
                {
                    SafeBeginInvoke(() =>
                    {
                        if (_isShowingResultCard) return;
                        lblEmpName.Text = "Scanning Face...";
                        lblEmpName.ForeColor = Color.White;
                        lblEmpCode.Text = "Align face with camera";
                        lblEmpCode.ForeColor = Color.Gray;

                        lblPunchStatus.Text = "ALIGNING FACE...";
                        lblPunchStatus.BackColor = Color.FromArgb(40, 50, 65);
                        lblPunchStatus.ForeColor = Color.Cyan;
                        lblPunchStatus.Font = new Font("Segoe UI", 16F, FontStyle.Bold);

                        lblPunchTime.Text = "";
                        lblRemarksDetail.Text = "Please look directly at the camera";
                        lblRemarksDetail.ForeColor = Color.FromArgb(200, 210, 225);
                        lblRemarksDetail.Visible = true;
                        lblVerificationBadge.Visible = false;

                        var oldImg = picEmployeeAvatar.Image;
                        picEmployeeAvatar.Image = null;
                        oldImg?.Dispose();
                    });
                }
                else
                {
                    SafeBeginInvoke(() =>
                    {
                        if (_isShowingResultCard) return;
                        _isShowingResultCard = true;
                        lblEmpName.Text = "Unrecognized Person";
                        lblEmpName.ForeColor = Color.FromArgb(250, 200, 200);
                        lblEmpCode.Text = "Face not found in database";
                        lblEmpCode.ForeColor = Color.Gray;

                        lblPunchStatus.Text = "NOT REGISTERED";
                        lblPunchStatus.BackColor = Color.FromArgb(60, 30, 30);
                        lblPunchStatus.ForeColor = Color.FromArgb(255, 100, 100);
                        lblPunchStatus.Font = new Font("Segoe UI", 16F, FontStyle.Bold);

                        lblPunchTime.Text = "";
                        lblRemarksDetail.Text = "⚠️ Face not registered in database";
                        lblRemarksDetail.ForeColor = Color.FromArgb(255, 180, 100);
                        lblRemarksDetail.Visible = true;
                        lblVerificationBadge.Visible = false;

                        var oldImg = picEmployeeAvatar.Image;
                        picEmployeeAvatar.Image = null;
                        oldImg?.Dispose();

                        try
                        {
                            System.Media.SystemSounds.Exclamation.Play();
                        }
                        catch { }

                        // ⏱️ Auto-switch screen back to Biometric Attendance screen after 1.5 seconds (2.5s total!)
                        _autoReturnTimer?.Stop();
                        _autoReturnTimer?.Dispose();
                        _autoReturnTimer = new System.Windows.Forms.Timer { Interval = 1500 };
                        _autoReturnTimer.Tick += (s, e) =>
                        {
                            _autoReturnTimer?.Stop();
                            _autoReturnTimer?.Dispose();
                            _autoReturnTimer = null;
                            _isShowingResultCard = false;
                            _unrecognizedFaceStartTime = null;
                            ResetCardToIdle();
                            ClearCameraFrame();
                            BackToFingerprintRequested?.Invoke();
                        };
                        _autoReturnTimer.Start();
                    });
                }
            }
        }

        private async Task ExecuteAttendancePunch(FaceEmployeeDto emp)
        {
            _consecutiveCandidateCode = null;
            _consecutiveMatchCount = 0;
            try
            {
                SafeBeginInvoke(() =>
                {
                    lblEmpName.Text = emp.name;
                    lblEmpCode.Text = $"Code: {emp.code}";
                    lblPunchStatus.Text = "VERIFYING PUNCH...";
                    lblPunchStatus.BackColor = Color.FromArgb(40, 80, 120);
                    lblPunchStatus.ForeColor = Color.White;
                    lblPunchStatus.Font = new Font("Segoe UI", 16F, FontStyle.Bold);
                    lblPunchTime.Text = $"{DateTime.Now:hh:mm:ss tt}";
                    lblRemarksDetail.Text = "Verifying with server...";
                    lblRemarksDetail.Visible = true;
                    LoadEmployeeAvatar(emp.photo);
                });

                // Backend determines IN vs OUT authoritatively based on department maxCheckoutTime and logical day.
                // We do not guess or hardcode "Hour < 12".
                var payload = new BiometricLogRequest
                {
                    employeeCode = emp.code,
                    type = "FACE_AI",
                    timestamp = DateTime.UtcNow,
                    branch = _config?.Branch,
                    method = "FACE_AI"
                };

                if (_client == null || _config == null)
                {
                    // Offline fallback: save to durable disk queue!
                    bool saved = OfflinePunchQueue.Enqueue(emp.code, emp.name, _config?.Branch ?? "Main", "FACE_AI", emp.photo, DateTime.UtcNow);
                    _punchCooldowns[emp.code] = DateTime.Now;
                    string displayTime = DateTime.Now.ToString("hh:mm:ss tt");
                    SafeBeginInvoke(() =>
                    {
                        ShowPunchResult(
                            emp: emp,
                            statusText: "RECORDED LOCALLY",
                            statusColor: Color.FromArgb(16, 185, 129),
                            timeText: $"Transaction Time: {displayTime}",
                            remarksDetail: saved 
                                ? "✅ Punch saved to disk outbox (Offline Mode — auto-syncs when online)" 
                                : "⚠️ Local punch recorded in memory",
                            photoData: emp.photo
                        );
                    });
                    return;
                }

                using var req = new HttpRequestMessage(HttpMethod.Post, "api/v1/attendance/biometric")
                {
                    Content = JsonContent.Create(payload)
                };

                if (!string.IsNullOrEmpty(_config.SecretKey))
                {
                    req.Headers.TryAddWithoutValidation("bas-secret-key", _config.SecretKey);
                }

                HttpResponseMessage resp;
                try
                {
                    resp = await _client.SendAsync(req);
                }
                catch (Exception netEx)
                {
                    // Network dropped or connection refused: save to durable offline outbox!
                    bool saved = OfflinePunchQueue.Enqueue(emp.code, emp.name, _config?.Branch ?? "Main", "FACE_AI", emp.photo, DateTime.UtcNow);
                    _punchCooldowns[emp.code] = DateTime.Now;
                    string displayTime = DateTime.Now.ToString("hh:mm:ss tt");
                    SafeBeginInvoke(() =>
                    {
                        ShowPunchResult(
                            emp: emp,
                            statusText: "RECORDED OFFLINE",
                            statusColor: Color.FromArgb(16, 185, 129),
                            timeText: $"Transaction Time: {displayTime}",
                            remarksDetail: saved 
                                ? "✅ Network offline: Punch queued locally on disk" 
                                : "⚠️ Network offline: Punch stored in memory",
                            photoData: emp.photo
                        );
                    });
                    return;
                }

                BiometricResponse? content = null;
                try
                {
                    content = await resp.Content.ReadFromJsonAsync<BiometricResponse>();
                }
                catch { }

                if (resp.IsSuccessStatusCode && content != null && content.success)
                {
                    _punchCooldowns[emp.code] = DateTime.Now;

                    bool isOut = (content.data?.action == "OUT");
                    _lastPunchStatus[emp.code] = isOut ? "OUT" : "IN";

                    string action = isOut ? "CHECKED OUT" : "CHECKED IN";
                    Color statusColor = isOut ? Color.FromArgb(220, 38, 38) : Color.FromArgb(16, 185, 129);
                    string displayTime = DateTime.Now.ToString("hh:mm:ss tt");
                    string remarks = isOut ? "✅ Check-OUT recorded successfully via Live Face AI" : "✅ Check-IN confirmed successfully via Live Face AI";
                    string photo = !string.IsNullOrEmpty(content.data?.photo) ? content.data.photo : emp.photo;

                    SafeBeginInvoke(() =>
                    {
                        ShowPunchResult(
                            emp: emp,
                            statusText: action,
                            statusColor: statusColor,
                            timeText: $"Transaction Time: {displayTime}",
                            remarksDetail: remarks,
                            photoData: photo
                        );
                    });
                }
                else
                {
                    string msg = content?.message ?? $"Server returned HTTP {(int)resp.StatusCode}";
                    bool isDuplicate = msg.IndexOf("Already", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                       msg.IndexOf("Too close", StringComparison.OrdinalIgnoreCase) >= 0;

                    if (isDuplicate)
                    {
                        // Genuine duplicate or rapid re-scan: Set cooldown and show informative status
                        _punchCooldowns[emp.code] = DateTime.Now;
                        bool isOut = msg.IndexOf("OUT", StringComparison.OrdinalIgnoreCase) >= 0;
                        _lastPunchStatus[emp.code] = isOut ? "OUT" : "IN";

                        string action = isOut ? "ALREADY CHECKED OUT" : "ALREADY CHECKED IN";
                        Color statusColor = Color.FromArgb(234, 88, 12); // Amber
                        string displayTime = DateTime.Now.ToString("hh:mm:ss tt");

                        SafeBeginInvoke(() =>
                        {
                            ShowPunchResult(
                                emp: emp,
                                statusText: action,
                                statusColor: statusColor,
                                timeText: $"Transaction Time: {displayTime}",
                                remarksDetail: $"ℹ️ {msg}",
                                photoData: emp.photo
                            );
                        });
                    }
                    else
                    {
                        // Validation error or server failure: DO NOT lock employee into 20s cooldown
                        SafeBeginInvoke(() =>
                        {
                            ShowPunchResult(
                                emp: emp,
                                statusText: "ATTENDANCE REJECTED",
                                statusColor: Color.FromArgb(220, 38, 38),
                                timeText: $"Transaction Time: {DateTime.Now:hh:mm:ss tt}",
                                remarksDetail: $"❌ {msg}",
                                photoData: emp.photo
                            );
                        });
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("Punch execution error: " + ex.Message);
            }
            finally
            {
                _activePunchingEmployees.TryRemove(emp.code, out _);
            }
        }

        private void ShowPunchResult(FaceEmployeeDto emp, string statusText, Color statusColor, string timeText, string remarksDetail, string? photoData)
        {
            _lastPunchedEmployee = emp;
            _backupTimeoutTimer?.Stop();
            _resetCardTimer?.Stop();
            _autoReturnTimer?.Stop();
            _autoReturnTimer?.Dispose();
            _isShowingResultCard = true;

            lblEmpName.Text = emp.name.ToUpper();
            lblEmpCode.Text = $"Employee Code: {emp.code} {(string.IsNullOrEmpty(emp.branch) ? "" : "• " + emp.branch)}";

            // Large, High-Visibility Status Badge (CHECKED IN, CHECKED OUT, ALREADY CHECKED OUT)
            lblPunchStatus.Text = statusText;
            lblPunchStatus.BackColor = statusColor;
            lblPunchStatus.ForeColor = Color.White;
            lblPunchStatus.Font = new Font("Segoe UI", 16F, FontStyle.Bold);

            // Large 12-Hour Punch Time
            lblPunchTime.Text = timeText;
            lblPunchTime.ForeColor = statusColor;
            lblPunchTime.Font = new Font("Segoe UI", 13F, FontStyle.Bold);

            // Detailed Remarks Message
            lblRemarksDetail.Text = remarksDetail;
            lblRemarksDetail.ForeColor = Color.FromArgb(220, 225, 235);
            lblRemarksDetail.Visible = true;

            lblVerificationBadge.Visible = true;

            // Load employee avatar photo (supports Base64 & URL)
            LoadEmployeeAvatar(photoData);

            try
            {
                System.Media.SystemSounds.Asterisk.Play();
            }
            catch { }

            // ⏱️ Auto-switch screen back to Biometric Attendance screen after 2.0 seconds
            _autoReturnTimer = new System.Windows.Forms.Timer { Interval = 2000 };
            _autoReturnTimer.Tick += (s, e) =>
            {
                _autoReturnTimer?.Stop();
                _autoReturnTimer?.Dispose();
                _autoReturnTimer = null;
                _isShowingResultCard = false;
                ResetCardToIdle();
                ClearCameraFrame();
                AttendancePunchedSuccessfully?.Invoke();
            };
            _autoReturnTimer.Start();
        }

        private void LoadEmployeeAvatar(string? photoData)
        {
            if (this.InvokeRequired)
            {
                SafeBeginInvoke(() => LoadEmployeeAvatar(photoData));
                return;
            }

            long currentGen = Interlocked.Increment(ref _avatarLoadGeneration);

            if (string.IsNullOrWhiteSpace(photoData))
            {
                picEmployeeAvatar.Image = null;
                return;
            }

            try
            {
                if (photoData.StartsWith("data:image") || (!photoData.StartsWith("http") && photoData.Length > 100))
                {
                    string b64 = photoData.Contains(",") ? photoData.Substring(photoData.IndexOf(",") + 1) : photoData;
                    byte[] bytes = Convert.FromBase64String(b64.Trim());
                    using var ms = new MemoryStream(bytes);
                    var bmp = new Bitmap(ms);
                    if (currentGen == _avatarLoadGeneration)
                    {
                        var old = picEmployeeAvatar.Image;
                        picEmployeeAvatar.Image = bmp;
                        old?.Dispose();
                    }
                    else
                    {
                        bmp.Dispose();
                    }
                }
                else if (photoData.StartsWith("http") || (_config != null && !string.IsNullOrEmpty(_config.ServerUrl)))
                {
                    string url = photoData.StartsWith("http") 
                        ? photoData 
                        : _config!.ServerUrl.TrimEnd('/') + "/" + photoData.TrimStart('/');

                    _ = Task.Run(async () =>
                    {
                        try
                        {
                            if (_client == null) return;
                            byte[] imgBytes = await _client.GetByteArrayAsync(url);
                            if (currentGen != _avatarLoadGeneration) return;

                            SafeBeginInvoke(() =>
                            {
                                if (currentGen != _avatarLoadGeneration) return;
                                using var ms = new MemoryStream(imgBytes);
                                var bmp = new Bitmap(ms);
                                var old = picEmployeeAvatar.Image;
                                picEmployeeAvatar.Image = bmp;
                                old?.Dispose();
                            });
                        }
                        catch { }
                    });
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("Avatar load error: " + ex.Message);
            }
        }

        public void ClearCameraFrame()
        {
            if (this.InvokeRequired)
            {
                SafeBeginInvoke(ClearCameraFrame);
                return;
            }
            try
            {
                var oldImg = picVideo.Image;
                picVideo.Image = null;
                oldImg?.Dispose();
                picVideo.BackColor = Color.Black;
                picVideo.Refresh();
            }
            catch { }
        }

        public void ResetCardToIdle()
        {
            if (this.InvokeRequired)
            {
                SafeBeginInvoke(ResetCardToIdle);
                return;
            }

            _lastPunchedEmployee = null;
            _consecutiveCandidateCode = null;
            _consecutiveMatchCount = 0;
            _autoReturnTimer?.Stop();
            _autoReturnTimer?.Dispose();
            _autoReturnTimer = null;
            _isShowingResultCard = false;
            _unrecognizedFaceStartTime = null;
            _resetCardTimer?.Stop();

            lblEmpName.Text = "Waiting for Employee...";
            lblEmpName.ForeColor = Color.White;

            lblEmpCode.Text = "Code: --";
            lblEmpCode.ForeColor = Color.Gray;

            lblPunchStatus.Text = "READY TO SCAN";
            lblPunchStatus.BackColor = Color.FromArgb(35, 40, 48);
            lblPunchStatus.ForeColor = Color.FromArgb(0, 210, 255);
            lblPunchStatus.Font = new Font("Segoe UI", 16F, FontStyle.Bold);

            lblPunchTime.Text = "";
            lblPunchTime.ForeColor = Color.FromArgb(16, 185, 129);

            lblRemarksDetail.Text = "";
            lblRemarksDetail.Visible = false;

            lblVerificationBadge.Visible = false;

            var oldImg = picEmployeeAvatar.Image;
            picEmployeeAvatar.Image = null;
            oldImg?.Dispose();

            pnlStatusCard.Refresh();
        }

        protected override void OnVisibleChanged(EventArgs e)
        {
            base.OnVisibleChanged(e);
            ResetCardToIdle();
            ClearCameraFrame();
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                try { Form1.UsbDeviceChanged -= OnUsbDeviceChanged; } catch { }
                if (_cameraManager != null)
                {
                    try { _cameraManager.NewFrameReceived -= OnCameraFrame; } catch { }
                    _cameraManager.Dispose();
                }
                _faceEngine?.Dispose();
                _clockTimer?.Stop();
                _clockTimer?.Dispose();
                _resetCardTimer?.Stop();
                _resetCardTimer?.Dispose();
                _backupTimeoutTimer?.Stop();
                _backupTimeoutTimer?.Dispose();
                _autoReturnTimer?.Stop();
                _autoReturnTimer?.Dispose();
                _offlineSyncTimer?.Stop();
                _offlineSyncTimer?.Dispose();

                try
                {
                    var oldImg = picEmployeeAvatar?.Image;
                    if (picEmployeeAvatar != null) picEmployeeAvatar.Image = null;
                    oldImg?.Dispose();

                    var oldVid = picVideo?.Image;
                    if (picVideo != null) picVideo.Image = null;
                    oldVid?.Dispose();
                }
                catch { }
            }
            base.Dispose(disposing);
        }
    }
}
