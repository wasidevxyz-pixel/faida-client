using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Linq;
using System.Windows.Forms;

namespace BiometricApp
{
    public class FaceDiagnosticView : UserControl
    {
        private CameraManager _cameraManager;
        private FaceEngine _faceEngine;

        // UI Controls - Header
        private Panel pnlHeader;
        private Label lblTitle;
        private Label lblCameraSelect;
        private ComboBox cmbCameras;
        private Button btnRefreshCameras;
        private Button btnBack;
        private Label lblStatusBadge;

        // UI Controls - Main Split
        private TableLayoutPanel tblMain;
        private Panel pnlVideoContainer;
        private PictureBox picVideo;
        private Panel pnlTelemetry;

        // Telemetry Cards
        private Panel pnlPoseCard;
        private Label lblPoseCardTitle;
        private Label lblYawValue;
        private Label lblPoseBadge;
        private Panel pnlYawMeter;
        private Label lblEyeDistance;

        private Panel pnlAiCard;
        private Label lblAiCardTitle;
        private Label lblConfidenceValue;
        private Label lblDetectorName;
        private Label lblLandmarkCount;
        private Label lblStabilityStatus;

        private Panel pnlPerfCard;
        private Label lblPerfCardTitle;
        private Label lblFpsValue;
        private Label lblLatencyValue;
        private Label lblFramesCount;
        private Label lblFailuresCount;

        private Panel pnlValidationCard;
        private Label lblValidationTitle;
        private CheckBox chkDetected;
        private CheckBox chkFront;
        private CheckBox chkLeft;
        private CheckBox chkRight;
        private CheckBox chkSFace;
        private Button btnSnapshot;
        private Button btnResetStats;

        // Runtime Metrics State
        private readonly Queue<double> _fpsHistory = new Queue<double>();
        private readonly Stopwatch _fpsStopwatch = new Stopwatch();
        private long _totalFramesProcessed = 0;
        private long _detectionFailuresCount = 0;
        private double _currentFps = 0.0;
        private double _lastInferenceMs = 0.0;
        private FaceDetectionResult? _lastResult = null;
        private volatile bool _isRendering = false;
        private readonly object _renderLock = new object();

        public event Action? BackRequested;

        public FaceDiagnosticView()
        {
            InitializeComponent();
            _cameraManager = new CameraManager();
            _faceEngine = new FaceEngine();
            _cameraManager.NewFrameReceived += OnCameraFrame;
            _fpsStopwatch.Start();
        }

        public void Initialize()
        {
            LoadCameras();
            Form1.UsbDeviceChanged += OnUsbChanged;
        }

        private void OnUsbChanged()
        {
            if (this.InvokeRequired)
            {
                this.BeginInvoke(new Action(OnUsbChanged));
                return;
            }
            LoadCameras();
        }

        public void StartCamera()
        {
            if (cmbCameras.SelectedItem is CameraDevice dev)
            {
                _cameraManager.Start(dev.Index);
            }
            else if (cmbCameras.Items.Count > 0)
            {
                cmbCameras.SelectedIndex = 0;
                if (cmbCameras.SelectedItem is CameraDevice firstDev)
                {
                    _cameraManager.Start(firstDev.Index);
                }
                else
                {
                    _cameraManager.Start(0);
                }
            }
            else
            {
                _cameraManager.Start(0);
            }
            lblStatusBadge.Text = "● CAMERA ACTIVE";
            lblStatusBadge.ForeColor = Color.FromArgb(0, 255, 128);
        }

        public void StopCamera()
        {
            _faceEngine?.ResetTracking();
            _cameraManager.Stop();
            lblStatusBadge.Text = "○ CAMERA IDLE";
            lblStatusBadge.ForeColor = Color.Gray;
        }

        private void LoadCameras()
        {
            try
            {
                var cams = CameraManager.GetAvailableCameras();
                cmbCameras.Items.Clear();
                foreach (var cam in cams)
                {
                    cmbCameras.Items.Add(cam);
                }
                if (cmbCameras.Items.Count > 0)
                {
                    var match = cams.Find(c => c.IsExternal) ?? cams[0];
                    cmbCameras.SelectedItem = match;
                }
            }
            catch { }
        }

        private void SwitchCamera()
        {
            if (this.Visible && cmbCameras.SelectedItem is CameraDevice dev)
            {
                if (dev.Index == _cameraManager.CurrentCameraIndex && _cameraManager.IsRunning) return;
                _faceEngine?.ResetTracking();
                _cameraManager.Start(dev.Index);
            }
        }

        private void InitializeComponent()
        {
            this.BackColor = Color.FromArgb(16, 20, 24);
            this.Dock = DockStyle.Fill;

            // 1. Top Header Panel
            pnlHeader = new Panel
            {
                Dock = DockStyle.Top,
                Height = 60,
                BackColor = Color.FromArgb(24, 28, 36),
                Padding = new Padding(15, 10, 15, 10)
            };

            lblTitle = new Label
            {
                Text = "🔬 BAS COMPUTER VISION & AI DIAGNOSTIC CONSOLE",
                Font = new Font("Segoe UI", 12F, FontStyle.Bold),
                ForeColor = Color.FromArgb(0, 220, 255),
                AutoSize = true,
                Location = new Point(15, 16)
            };

            lblStatusBadge = new Label
            {
                Text = "○ INITIALIZING",
                Font = new Font("Segoe UI", 9F, FontStyle.Bold),
                ForeColor = Color.Yellow,
                AutoSize = true,
                Location = new Point(480, 20)
            };

            lblCameraSelect = new Label
            {
                Text = "Camera:",
                Font = new Font("Segoe UI", 9F, FontStyle.Bold),
                ForeColor = Color.Gainsboro,
                AutoSize = true,
                Location = new Point(640, 20)
            };

            cmbCameras = new ComboBox
            {
                DropDownStyle = ComboBoxStyle.DropDownList,
                Width = 220,
                Location = new Point(705, 16),
                Font = new Font("Segoe UI", 9F)
            };
            cmbCameras.SelectedIndexChanged += (s, e) => SwitchCamera();

            btnRefreshCameras = new Button
            {
                Text = "🔄",
                Font = new Font("Segoe UI", 9F, FontStyle.Bold),
                Location = new Point(932, 15),
                Size = new Size(32, 28),
                BackColor = Color.FromArgb(40, 50, 65),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Cursor = Cursors.Hand
            };
            btnRefreshCameras.FlatAppearance.BorderSize = 0;
            btnRefreshCameras.Click += (s, e) => LoadCameras();

            btnBack = new Button
            {
                Text = "← Exit Diagnostic",
                Font = new Font("Segoe UI", 9F, FontStyle.Bold),
                Location = new Point(980, 14),
                Size = new Size(130, 30),
                BackColor = Color.FromArgb(50, 60, 80),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Cursor = Cursors.Hand
            };
            btnBack.FlatAppearance.BorderSize = 0;
            btnBack.Click += (s, e) => {
                StopCamera();
                BackRequested?.Invoke();
            };

            pnlHeader.Controls.AddRange(new Control[] {
                lblTitle, lblStatusBadge, lblCameraSelect, cmbCameras, btnRefreshCameras, btnBack
            });

            // 2. Main Layout Split (Camera Feed on Left, Diagnostic Telemetry on Right)
            tblMain = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 2,
                RowCount = 1,
                BackColor = Color.FromArgb(16, 20, 24),
                Padding = new Padding(12)
            };
            tblMain.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 68f));
            tblMain.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 32f));
            tblMain.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));

            // Left: Camera Canvas
            pnlVideoContainer = new Panel
            {
                Dock = DockStyle.Fill,
                BackColor = Color.FromArgb(10, 12, 16),
                Padding = new Padding(6)
            };

            picVideo = new PictureBox
            {
                Dock = DockStyle.Fill,
                SizeMode = PictureBoxSizeMode.Zoom,
                BackColor = Color.Black
            };
            pnlVideoContainer.Controls.Add(picVideo);

            // Right: Diagnostic Telemetry Panel
            pnlTelemetry = new Panel
            {
                Dock = DockStyle.Fill,
                AutoScroll = true,
                BackColor = Color.FromArgb(20, 24, 30),
                Padding = new Padding(10)
            };

            BuildTelemetryCards();

            tblMain.Controls.Add(pnlVideoContainer, 0, 0);
            tblMain.Controls.Add(pnlTelemetry, 1, 0);

            this.Controls.Add(tblMain);
            this.Controls.Add(pnlHeader);
        }

        private void BuildTelemetryCards()
        {
            int yPos = 10;
            int cardW = 340;

            // --- Card 1: Head Pose Analysis ---
            pnlPoseCard = CreateCardPanel(yPos, cardW, 175);
            lblPoseCardTitle = CreateCardHeader("📐 HEAD POSE & MULTI-ANGLE ESTIMATION");
            pnlPoseCard.Controls.Add(lblPoseCardTitle);

            lblPoseBadge = new Label
            {
                Text = "SEARCHING FACE...",
                Font = new Font("Segoe UI", 11F, FontStyle.Bold),
                ForeColor = Color.Yellow,
                Location = new Point(15, 38),
                AutoSize = true
            };
            pnlPoseCard.Controls.Add(lblPoseBadge);

            lblYawValue = new Label
            {
                Text = "Estimated Yaw: 0.0°",
                Font = new Font("Segoe UI", 10F, FontStyle.Regular),
                ForeColor = Color.White,
                Location = new Point(15, 68),
                AutoSize = true
            };
            pnlPoseCard.Controls.Add(lblYawValue);

            // Yaw Arc / Bar Gauge
            pnlYawMeter = new Panel
            {
                Location = new Point(15, 95),
                Size = new Size(310, 36),
                BackColor = Color.FromArgb(12, 16, 20)
            };
            pnlYawMeter.Paint += DrawYawMeter;
            pnlPoseCard.Controls.Add(pnlYawMeter);

            lblEyeDistance = new Label
            {
                Text = "Inter-Pupillary Distance (IPD): 0 px",
                Font = new Font("Segoe UI", 8.5F),
                ForeColor = Color.DarkGray,
                Location = new Point(15, 140),
                AutoSize = true
            };
            pnlPoseCard.Controls.Add(lblEyeDistance);

            pnlTelemetry.Controls.Add(pnlPoseCard);
            yPos += 185;

            // --- Card 2: AI Vision Metrics ---
            pnlAiCard = CreateCardPanel(yPos, cardW, 140);
            lblAiCardTitle = CreateCardHeader("🧠 COMPUTER VISION AI ENGINE");
            pnlAiCard.Controls.Add(lblAiCardTitle);

            lblConfidenceValue = new Label
            {
                Text = "Detection Confidence: --%",
                Font = new Font("Segoe UI", 10F, FontStyle.Bold),
                ForeColor = Color.FromArgb(0, 220, 255),
                Location = new Point(15, 36),
                AutoSize = true
            };
            pnlAiCard.Controls.Add(lblConfidenceValue);

            lblDetectorName = new Label
            {
                Text = "Model: OpenCV YuNet (Trained 5-KPS CNN)",
                Font = new Font("Segoe UI", 9F),
                ForeColor = Color.Gainsboro,
                Location = new Point(15, 62),
                AutoSize = true
            };
            pnlAiCard.Controls.Add(lblDetectorName);

            lblLandmarkCount = new Label
            {
                Text = "Landmarks: 5 Keypoints (Eyes, Nose, Mouth)",
                Font = new Font("Segoe UI", 9F),
                ForeColor = Color.Gainsboro,
                Location = new Point(15, 84),
                AutoSize = true
            };
            pnlAiCard.Controls.Add(lblLandmarkCount);

            lblStabilityStatus = new Label
            {
                Text = "Background Immunity: ACTIVE (Wallpaper filtered)",
                Font = new Font("Segoe UI", 9F, FontStyle.Bold),
                ForeColor = Color.FromArgb(120, 255, 120),
                Location = new Point(15, 108),
                AutoSize = true
            };
            pnlAiCard.Controls.Add(lblStabilityStatus);

            pnlTelemetry.Controls.Add(pnlAiCard);
            yPos += 150;

            // --- Card 3: Performance & Real-Time Health ---
            pnlPerfCard = CreateCardPanel(yPos, cardW, 130);
            lblPerfCardTitle = CreateCardHeader("⚡ REAL-TIME PERFORMANCE & HUD");
            pnlPerfCard.Controls.Add(lblPerfCardTitle);

            lblFpsValue = new Label
            {
                Text = "Frame Rate: 0.0 FPS",
                Font = new Font("Segoe UI", 10F, FontStyle.Bold),
                ForeColor = Color.FromArgb(0, 255, 180),
                Location = new Point(15, 36),
                AutoSize = true
            };
            pnlPerfCard.Controls.Add(lblFpsValue);

            lblLatencyValue = new Label
            {
                Text = "Inference Latency: 0.0 ms",
                Font = new Font("Segoe UI", 9F),
                ForeColor = Color.Gainsboro,
                Location = new Point(15, 62),
                AutoSize = true
            };
            pnlPerfCard.Controls.Add(lblLatencyValue);

            lblFramesCount = new Label
            {
                Text = "Frames Processed: 0",
                Font = new Font("Segoe UI", 9F),
                ForeColor = Color.Gainsboro,
                Location = new Point(15, 84),
                AutoSize = true
            };
            pnlPerfCard.Controls.Add(lblFramesCount);

            lblFailuresCount = new Label
            {
                Text = "Detection Failures: 0 (0.0%)",
                Font = new Font("Segoe UI", 9F),
                ForeColor = Color.Gainsboro,
                Location = new Point(15, 104),
                AutoSize = true
            };
            pnlPerfCard.Controls.Add(lblFailuresCount);

            pnlTelemetry.Controls.Add(pnlPerfCard);
            yPos += 140;

            // --- Card 4: Interactive Live Validation Guide ---
            pnlValidationCard = CreateCardPanel(yPos, cardW, 215);
            lblValidationTitle = CreateCardHeader("✅ LIVE POSE & STABILITY CHECKLIST");
            pnlValidationCard.Controls.Add(lblValidationTitle);

            chkDetected = CreateCheckItem("1. Face Detected & Locked", 36);
            chkFront = CreateCheckItem("2. Facing Forward (-10° to +10°)", 58);
            chkLeft = CreateCheckItem("3. Turned Left (> +12°)", 80);
            chkRight = CreateCheckItem("4. Turned Right (< -12°)", 102);
            chkSFace = CreateCheckItem("5. SFace 128-dim Embedding OK", 124);

            pnlValidationCard.Controls.AddRange(new Control[] {
                chkDetected, chkFront, chkLeft, chkRight, chkSFace
            });

            btnSnapshot = new Button
            {
                Text = "📸 Save Diagnostic Frame",
                Font = new Font("Segoe UI", 9F, FontStyle.Bold),
                Location = new Point(15, 155),
                Size = new Size(160, 32),
                BackColor = Color.FromArgb(0, 140, 200),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Cursor = Cursors.Hand
            };
            btnSnapshot.FlatAppearance.BorderSize = 0;
            btnSnapshot.Click += (s, e) => SaveDiagnosticSnapshot();

            btnResetStats = new Button
            {
                Text = "🔄 Reset Stats",
                Font = new Font("Segoe UI", 9F, FontStyle.Bold),
                Location = new Point(185, 155),
                Size = new Size(140, 32),
                BackColor = Color.FromArgb(55, 65, 80),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Cursor = Cursors.Hand
            };
            btnResetStats.FlatAppearance.BorderSize = 0;
            btnResetStats.Click += (s, e) => ResetCounters();

            pnlValidationCard.Controls.Add(btnSnapshot);
            pnlValidationCard.Controls.Add(btnResetStats);

            pnlTelemetry.Controls.Add(pnlValidationCard);
        }

        private Panel CreateCardPanel(int y, int width, int height)
        {
            return new Panel
            {
                Location = new Point(10, y),
                Size = new Size(width, height),
                BackColor = Color.FromArgb(28, 34, 44),
                Padding = new Padding(10)
            };
        }

        private Label CreateCardHeader(string title)
        {
            return new Label
            {
                Text = title,
                Font = new Font("Segoe UI", 8.5F, FontStyle.Bold),
                ForeColor = Color.FromArgb(0, 210, 255),
                Location = new Point(10, 10),
                AutoSize = true
            };
        }

        private CheckBox CreateCheckItem(string label, int y)
        {
            return new CheckBox
            {
                Text = label,
                Font = new Font("Segoe UI", 8.5F),
                ForeColor = Color.LightGray,
                Location = new Point(15, y),
                AutoSize = true,
                Enabled = false
            };
        }

        private void DrawYawMeter(object? sender, PaintEventArgs e)
        {
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;

            int w = pnlYawMeter.Width;
            int h = pnlYawMeter.Height;

            // Background meter track
            using var bgBrush = new SolidBrush(Color.FromArgb(20, 24, 30));
            g.FillRectangle(bgBrush, 0, 0, w, h);

            // Zones: Left [-45° to -12°], Center [-12° to +12°], Right [+12° to +45°]
            float minDeg = -45f;
            float maxDeg = 45f;
            float range = maxDeg - minDeg;

            float xCenterLeft = w * ((-12f - minDeg) / range);
            float xCenterRight = w * ((12f - minDeg) / range);

            // Left zone (Cyan)
            using var leftBrush = new SolidBrush(Color.FromArgb(40, 0, 180, 255));
            g.FillRectangle(leftBrush, 0, 0, xCenterLeft, h);

            // Center zone (Green)
            using var centerBrush = new SolidBrush(Color.FromArgb(40, 0, 255, 128));
            g.FillRectangle(centerBrush, xCenterLeft, 0, xCenterRight - xCenterLeft, h);

            // Right zone (Orange)
            using var rightBrush = new SolidBrush(Color.FromArgb(40, 255, 140, 0));
            g.FillRectangle(rightBrush, xCenterRight, 0, w - xCenterRight, h);

            // Center zero tick line
            float xZero = w * ((0f - minDeg) / range);
            using var zeroPen = new Pen(Color.FromArgb(100, 255, 255, 255), 1.5f);
            g.DrawLine(zeroPen, xZero, 0, xZero, h);

            // Current Yaw Needle
            float currentYaw = _lastResult != null ? Math.Clamp(_lastResult.YawDegrees, minDeg, maxDeg) : 0f;
            float needleX = w * ((currentYaw - minDeg) / range);

            Color needleColor = Math.Abs(currentYaw) <= 12f ? Color.FromArgb(0, 255, 128) : (currentYaw > 12f ? Color.FromArgb(0, 220, 255) : Color.FromArgb(255, 140, 0));
            using var needleBrush = new SolidBrush(needleColor);
            using var needlePen = new Pen(needleColor, 3f);

            g.DrawLine(needlePen, needleX, 0, needleX, h);
            g.FillPolygon(needleBrush, new PointF[] {
                new PointF(needleX - 5, 0),
                new PointF(needleX + 5, 0),
                new PointF(needleX, 8)
            });

            // Labels: L, C, R
            using var font = new Font("Segoe UI", 7F, FontStyle.Bold);
            using var textBrush = new SolidBrush(Color.Gainsboro);
            g.DrawString("◄ LEFT", font, textBrush, 4, h - 14);
            g.DrawString("FRONT", font, textBrush, xZero - 16, h - 14);
            g.DrawString("RIGHT ►", font, textBrush, w - 46, h - 14);
        }

        private void OnCameraFrame(Bitmap frame)
        {
            if (_isRendering) return;

            lock (_renderLock)
            {
                _isRendering = true;
                _totalFramesProcessed++;

                var swInference = Stopwatch.StartNew();
                List<FaceDetectionResult>? results = null;

                try
                {
                    results = _faceEngine.ProcessFrame(frame);
                }
                catch { }

                swInference.Stop();
                _lastInferenceMs = swInference.Elapsed.TotalMilliseconds;

                // FPS rolling average
                double elapsedSec = _fpsStopwatch.Elapsed.TotalSeconds;
                _fpsStopwatch.Restart();
                if (elapsedSec > 0.001)
                {
                    double instantFps = 1.0 / elapsedSec;
                    _fpsHistory.Enqueue(instantFps);
                    if (_fpsHistory.Count > 20) _fpsHistory.Dequeue();
                    _currentFps = _fpsHistory.Average();
                }

                FaceDetectionResult? bestFace = (results != null && results.Count > 0) ? results[0] : null;
                _lastResult = bestFace;

                if (bestFace == null)
                {
                    _detectionFailuresCount++;
                }

                // Render annotated frame onto canvas
                Bitmap displayBitmap = RenderAnnotatedFrame(frame, bestFace);

                if (this.InvokeRequired)
                {
                    try
                    {
                        this.BeginInvoke(new Action(() => UpdateUI(displayBitmap, bestFace)));
                    }
                    catch { _isRendering = false; }
                }
                else
                {
                    UpdateUI(displayBitmap, bestFace);
                }
            }
        }

        private Bitmap RenderAnnotatedFrame(Bitmap original, FaceDetectionResult? face)
        {
            var output = new Bitmap(original.Width, original.Height);
            using (var g = Graphics.FromImage(output))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;

                // Draw camera feed
                g.DrawImage(original, 0, 0, original.Width, original.Height);

                if (face != null)
                {
                    var box = face.BoundingBox;

                    // 1. High-Contrast Bounding Box
                    Color boxColor = face.PoseAngle == HeadPoseAngle.Front 
                        ? Color.FromArgb(0, 255, 128) 
                        : (face.PoseAngle == HeadPoseAngle.TurnLeft ? Color.FromArgb(0, 220, 255) : Color.FromArgb(255, 140, 0));

                    using (var boxPen = new Pen(boxColor, 2.5f))
                    {
                        g.DrawRectangle(boxPen, box);
                    }

                    // Corner bracket accents
                    DrawCornerBrackets(g, box, boxColor, 18, 3.5f);

                    // 2. Five Facial Landmarks
                    if (face.HasLandmarks && face.Landmarks != null && face.Landmarks.Length >= 5)
                    {
                        var re = face.Landmarks[0]; // Right Eye
                        var le = face.Landmarks[1]; // Left Eye
                        var nt = face.Landmarks[2]; // Nose Tip
                        var mr = face.Landmarks[3]; // Mouth Right
                        var ml = face.Landmarks[4]; // Mouth Left

                        // Connect eyes line
                        using (var eyeLinePen = new Pen(Color.FromArgb(160, 0, 220, 255), 1.5f) { DashStyle = DashStyle.Dot })
                        {
                            g.DrawLine(eyeLinePen, re, le);
                        }

                        // Orientation ray from nose
                        float rayDx = (face.YawDegrees / 45f) * 40f;
                        using (var rayPen = new Pen(Color.FromArgb(255, 230, 0), 2.5f))
                        {
                            rayPen.EndCap = LineCap.ArrowAnchor;
                            g.DrawLine(rayPen, nt.X, nt.Y, nt.X + rayDx, nt.Y);
                        }

                        // Draw keypoints
                        DrawLandmarkCrosshair(g, re, Color.Cyan, "R-Eye");
                        DrawLandmarkCrosshair(g, le, Color.Cyan, "L-Eye");
                        DrawLandmarkCrosshair(g, nt, Color.Gold, "Nose");
                        DrawLandmarkDot(g, mr, Color.Magenta, "M-R");
                        DrawLandmarkDot(g, ml, Color.Magenta, "M-L");
                    }

                    // 3. Top Face Info Badge
                    string badgeText = $"YuNet CNN: {face.Confidence * 100:F1}% | {face.PoseLabel}";
                    using var badgeFont = new Font("Segoe UI", 9F, FontStyle.Bold);
                    var textSize = g.MeasureString(badgeText, badgeFont);
                    int badgeY = Math.Max(5, box.Y - (int)textSize.Height - 8);
                    int badgeX = Math.Max(5, box.X);

                    using var bgBrush = new SolidBrush(Color.FromArgb(200, 15, 20, 25));
                    g.FillRectangle(bgBrush, badgeX, badgeY, textSize.Width + 12, textSize.Height + 6);
                    using var borderPen = new Pen(boxColor, 1.5f);
                    g.DrawRectangle(borderPen, badgeX, badgeY, textSize.Width + 12, textSize.Height + 6);
                    using var textBrush = new SolidBrush(Color.White);
                    g.DrawString(badgeText, badgeFont, textBrush, badgeX + 6, badgeY + 3);
                }

                // 4. On-Screen HUD Overlay Strip at bottom
                int hudH = 32;
                int hudY = original.Height - hudH;
                using var hudBg = new SolidBrush(Color.FromArgb(210, 10, 14, 20));
                g.FillRectangle(hudBg, 0, hudY, original.Width, hudH);

                string hudText = $"FPS: {_currentFps:F1} | Latency: {_lastInferenceMs:F1} ms | Frames: {_totalFramesProcessed:N0} | Failures: {_detectionFailuresCount:N0} | Pipeline: YuNet (5-KPS) + SFace (128D)";
                using var hudFont = new Font("Segoe UI", 9F, FontStyle.Bold);
                using var hudBrush = new SolidBrush(Color.FromArgb(0, 220, 255));
                g.DrawString(hudText, hudFont, hudBrush, 12, hudY + 8);
            }

            return output;
        }

        private void DrawCornerBrackets(Graphics g, Rectangle r, Color color, int len, float thickness)
        {
            using var pen = new Pen(color, thickness);
            // Top-Left
            g.DrawLine(pen, r.Left, r.Top, r.Left + len, r.Top);
            g.DrawLine(pen, r.Left, r.Top, r.Left, r.Top + len);
            // Top-Right
            g.DrawLine(pen, r.Right, r.Top, r.Right - len, r.Top);
            g.DrawLine(pen, r.Right, r.Top, r.Right, r.Top + len);
            // Bottom-Left
            g.DrawLine(pen, r.Left, r.Bottom, r.Left + len, r.Bottom);
            g.DrawLine(pen, r.Left, r.Bottom, r.Left, r.Bottom - len);
            // Bottom-Right
            g.DrawLine(pen, r.Right, r.Bottom, r.Right - len, r.Bottom);
            g.DrawLine(pen, r.Right, r.Bottom, r.Right, r.Bottom - len);
        }

        private void DrawLandmarkCrosshair(Graphics g, PointF pt, Color color, string tag)
        {
            float r = 5f;
            using var pen = new Pen(color, 2f);
            using var brush = new SolidBrush(Color.FromArgb(180, color));
            g.FillEllipse(brush, pt.X - r, pt.Y - r, r * 2, r * 2);
            g.DrawEllipse(pen, pt.X - r - 2, pt.Y - r - 2, (r + 2) * 2, (r + 2) * 2);

            // Crosshair
            g.DrawLine(pen, pt.X - 8, pt.Y, pt.X + 8, pt.Y);
            g.DrawLine(pen, pt.X, pt.Y - 8, pt.X, pt.Y + 8);

            // Label
            using var font = new Font("Segoe UI", 7F, FontStyle.Bold);
            using var tBrush = new SolidBrush(Color.White);
            g.DrawString(tag, font, tBrush, pt.X + 8, pt.Y - 12);
        }

        private void DrawLandmarkDot(Graphics g, PointF pt, Color color, string tag)
        {
            float r = 4f;
            using var brush = new SolidBrush(color);
            using var pen = new Pen(Color.White, 1.5f);
            g.FillEllipse(brush, pt.X - r, pt.Y - r, r * 2, r * 2);
            g.DrawEllipse(pen, pt.X - r, pt.Y - r, r * 2, r * 2);

            using var font = new Font("Segoe UI", 7F, FontStyle.Bold);
            using var tBrush = new SolidBrush(Color.Gainsboro);
            g.DrawString(tag, font, tBrush, pt.X + 6, pt.Y - 6);
        }

        private void UpdateUI(Bitmap displayFrame, FaceDetectionResult? face)
        {
            try
            {
                var oldImg = picVideo.Image;
                picVideo.Image = displayFrame;
                oldImg?.Dispose();

                if (face != null)
                {
                    lblPoseBadge.Text = face.PoseLabel.ToUpperInvariant();
                    lblPoseBadge.ForeColor = face.PoseAngle == HeadPoseAngle.Front 
                        ? Color.FromArgb(0, 255, 128) 
                        : (face.PoseAngle == HeadPoseAngle.TurnLeft ? Color.FromArgb(0, 220, 255) : Color.FromArgb(255, 140, 0));

                    lblYawValue.Text = $"Estimated Yaw: {face.YawDegrees:+0.0;-0.0;0.0}°";
                    lblEyeDistance.Text = $"Inter-Pupillary Distance (IPD): {face.EyeDistance:F1} px";
                    lblConfidenceValue.Text = $"Detection Confidence: {face.Confidence * 100:F1}%";

                    // Update checklist
                    chkDetected.Checked = true;
                    if (Math.Abs(face.YawDegrees) <= 10f) chkFront.Checked = true;
                    if (face.YawDegrees > 12f) chkLeft.Checked = true;
                    if (face.YawDegrees < -12f) chkRight.Checked = true;
                    if (face.Embedding != null && face.Embedding.Count > 0) chkSFace.Checked = true;
                }
                else
                {
                    lblPoseBadge.Text = "SEARCHING FOR FACE...";
                    lblPoseBadge.ForeColor = Color.Yellow;
                    lblConfidenceValue.Text = "Detection Confidence: --%";
                }

                // Performance metrics
                lblFpsValue.Text = $"Frame Rate: {_currentFps:F1} FPS";
                lblLatencyValue.Text = $"Inference Latency: {_lastInferenceMs:F1} ms";
                lblFramesCount.Text = $"Frames Processed: {_totalFramesProcessed:N0}";

                double failRate = _totalFramesProcessed > 0 ? ((double)_detectionFailuresCount / _totalFramesProcessed * 100.0) : 0.0;
                lblFailuresCount.Text = $"Detection Failures: {_detectionFailuresCount:N0} ({failRate:F1}%)";

                // Refresh Yaw gauge
                pnlYawMeter.Invalidate();
            }
            finally
            {
                _isRendering = false;
            }
        }

        private void SaveDiagnosticSnapshot()
        {
            try
            {
                if (picVideo.Image == null)
                {
                    MessageBox.Show("No active video feed to capture.", "Diagnostic Snapshot", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }

                string dumpDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "diagnostics_snapshots");
                if (!Directory.Exists(dumpDir)) Directory.CreateDirectory(dumpDir);

                string timestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
                string filename = Path.Combine(dumpDir, $"diagnostic_snap_{timestamp}.png");

                using (var bmp = new Bitmap(picVideo.Image))
                {
                    bmp.Save(filename, System.Drawing.Imaging.ImageFormat.Png);
                }

                MessageBox.Show($"Diagnostic Frame saved successfully:\n{filename}", "Snapshot Captured", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Failed to save snapshot: " + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void ResetCounters()
        {
            _totalFramesProcessed = 0;
            _detectionFailuresCount = 0;
            _fpsHistory.Clear();
            chkDetected.Checked = false;
            chkFront.Checked = false;
            chkLeft.Checked = false;
            chkRight.Checked = false;
            chkSFace.Checked = false;
            pnlYawMeter.Invalidate();
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                StopCamera();
                _cameraManager?.Dispose();
                _faceEngine?.Dispose();
            }
            base.Dispose(disposing);
        }
    }
}
