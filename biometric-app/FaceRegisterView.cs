using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace BiometricApp
{
    public class FaceRegisterView : UserControl
    {
        private HttpClient _client;
        private Config _config;
        private CameraManager _cameraManager;
        private FaceEngine _faceEngine;

        private List<Employee> _employees = new List<Employee>();
        private List<Store> _stores = new List<Store>();

        // 10-Second Continuous Calibration State
        private readonly System.Windows.Forms.Timer _calibrationTimer;
        private readonly System.Diagnostics.Stopwatch _stopwatch = new System.Diagnostics.Stopwatch();
        private bool _isCalibrating = false;

        private readonly List<List<float>> _collectedEmbeddings = new List<List<float>>();
        private List<float>? _anchorEmbedding = null;
        private float _bestFrontalYaw = 999f;
        private DateTime _lastSampleTime = DateTime.MinValue;

        private string _capturedAvatarBase64 = string.Empty;
        private string _frontCropBase64 = string.Empty;
        private string _leftCropBase64 = string.Empty;
        private string _rightCropBase64 = string.Empty;

        // UI Controls
        private Panel pnlHeader;
        private Label lblTitle;
        private ComboBox cmbBranches;
        private TextBox txtSearchEmployee;
        private ComboBox cmbEmployees;
        private ComboBox cmbCameras;
        private Button btnRefreshCameras;

        private Button btnStartCalibration;
        private Button btnSaveSync;
        private Button btnReset;

        private TableLayoutPanel tblLayout;
        private Panel pnlLeftWizard;
        private Panel pnlCameraViewport;
        private PictureBox picCamera;

        private Label lblSequenceTitle;
        private Label lblSubtitle;
        private ProgressBar prgEnrollment;
        private Label lblTimer;
        private Label lblFrameStats;

        private Label lblInstruction;
        private Label lblQualityIndicator;

        private FaceDetectionResult _lastFaceResult;
        private bool _isPopulatingCameras = false;
        private volatile bool _isRenderingFrame = false;

        public FaceRegisterView()
        {
            InitializeComponent();
            _cameraManager = new CameraManager();
            _faceEngine = new FaceEngine();
            _cameraManager.NewFrameReceived += OnCameraFrame;

            _calibrationTimer = new System.Windows.Forms.Timer { Interval = 100 };
            _calibrationTimer.Tick += OnCalibrationTimerTick;
        }

        public void Initialize(HttpClient client, Config config, List<Store> stores, List<Employee> employees)
        {
            _client = client;
            _config = config;
            _stores = stores;
            _employees = employees;

            PopulateDropdowns();
            PopulateCameraDevices(false);

            Form1.UsbDeviceChanged += OnUsbDeviceChanged;
        }

        private void OnUsbDeviceChanged()
        {
            if (this.InvokeRequired)
            {
                this.BeginInvoke(new Action(OnUsbDeviceChanged));
                return;
            }
            PopulateCameraDevices(preserveSelection: false);
        }

        private void InitializeComponent()
        {
            this.BackColor = Color.FromArgb(20, 24, 28);
            this.Dock = DockStyle.Fill;

            // 1. Header with Title, Branch, Search, Employee, and Camera Selectors
            pnlHeader = new Panel
            {
                Dock = DockStyle.Top,
                Height = 68,
                BackColor = Color.FromArgb(28, 32, 38),
                Padding = new Padding(12, 10, 12, 10)
            };

            lblTitle = new Label
            {
                Text = "👤 10-SECOND AI FACE SCAN",
                Font = new Font("Segoe UI", 11F, FontStyle.Bold),
                ForeColor = Color.FromArgb(0, 210, 255),
                AutoSize = true,
                Location = new Point(12, 22)
            };

            var lblBranch = new Label
            {
                Text = "Branch:",
                Font = new Font("Segoe UI", 8.5F, FontStyle.Bold),
                ForeColor = Color.LightGray,
                AutoSize = true,
                Location = new Point(325, 24)
            };

            cmbBranches = new ComboBox
            {
                DropDownStyle = ComboBoxStyle.DropDownList,
                Width = 115,
                Location = new Point(375, 20),
                Font = new Font("Segoe UI", 9F)
            };
            cmbBranches.SelectedIndexChanged += (s, e) => {
                if (_isAutoSelectingBranch) return;
                txtSearchEmployee.Clear();
                FilterEmployees();
            };

            var lblSearch = new Label
            {
                Text = "Search:",
                Font = new Font("Segoe UI", 8.5F, FontStyle.Bold),
                ForeColor = Color.LightGray,
                AutoSize = true,
                Location = new Point(498, 24)
            };

            txtSearchEmployee = new TextBox
            {
                Width = 100,
                Location = new Point(545, 20),
                Font = new Font("Segoe UI", 9F),
                PlaceholderText = "Code / Name"
            };
            txtSearchEmployee.TextChanged += (s, e) => FilterEmployees();
            txtSearchEmployee.KeyDown += (s, e) => {
                if (e.KeyCode == Keys.Enter)
                {
                    e.SuppressKeyPress = true;
                    if (cmbEmployees.Items.Count > 0)
                    {
                        btnStartCalibration.Focus();
                    }
                }
            };

            var lblEmp = new Label
            {
                Text = "Employee:",
                Font = new Font("Segoe UI", 8.5F, FontStyle.Bold),
                ForeColor = Color.LightGray,
                AutoSize = true,
                Location = new Point(653, 24)
            };

            cmbEmployees = new ComboBox
            {
                DropDownStyle = ComboBoxStyle.DropDownList,
                Width = 210,
                Location = new Point(718, 20),
                Font = new Font("Segoe UI", 9F)
            };
            cmbEmployees.SelectedIndexChanged += (s, e) => AutoSelectBranchForEmployee();

            var lblCamera = new Label
            {
                Text = "Camera:",
                Font = new Font("Segoe UI", 8.5F, FontStyle.Bold),
                ForeColor = Color.LightGray,
                AutoSize = true,
                Location = new Point(936, 24)
            };

            cmbCameras = new ComboBox
            {
                DropDownStyle = ComboBoxStyle.DropDownList,
                Width = 200,
                Location = new Point(990, 20),
                Font = new Font("Segoe UI", 8.5F)
            };
            cmbCameras.SelectedIndexChanged += (s, e) => SwitchCamera();

            btnRefreshCameras = new Button
            {
                Text = "🔄",
                Font = new Font("Segoe UI", 9F, FontStyle.Bold),
                Location = new Point(1195, 19),
                Size = new Size(30, 27),
                BackColor = Color.FromArgb(45, 55, 75),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Cursor = Cursors.Hand
            };
            btnRefreshCameras.FlatAppearance.BorderSize = 0;
            btnRefreshCameras.Click += (s, e) => {
                PopulateCameraDevices(false);
                MessageBox.Show($"Camera scan complete.\nFound {cmbCameras.Items.Count} active video device(s).", "Cameras Refreshed", MessageBoxButtons.OK, MessageBoxIcon.Information);
            };

            pnlHeader.Controls.Add(lblTitle);
            pnlHeader.Controls.Add(lblBranch);
            pnlHeader.Controls.Add(cmbBranches);
            pnlHeader.Controls.Add(lblSearch);
            pnlHeader.Controls.Add(txtSearchEmployee);
            pnlHeader.Controls.Add(lblEmp);
            pnlHeader.Controls.Add(cmbEmployees);
            pnlHeader.Controls.Add(lblCamera);
            pnlHeader.Controls.Add(cmbCameras);
            pnlHeader.Controls.Add(btnRefreshCameras);

            // 2. Main Two-Column Layout (35% Stepper Wizard, 65% Camera)
            tblLayout = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 2,
                RowCount = 1,
                Padding = new Padding(12)
            };
            tblLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 35F));
            tblLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 65F));

            // Left Stepper Wizard Panel
            pnlLeftWizard = new Panel
            {
                Dock = DockStyle.Fill,
                BackColor = Color.FromArgb(28, 32, 38),
                Padding = new Padding(18)
            };

            lblSequenceTitle = new Label
            {
                Text = "⚡ 10-SECOND LIVE FACE SCAN",
                Font = new Font("Segoe UI", 10.5F, FontStyle.Bold),
                ForeColor = Color.White,
                Dock = DockStyle.Top,
                Height = 24
            };

            lblSubtitle = new Label
            {
                Text = "Freely move your face naturally. AI automatically learns and registers your face.",
                Font = new Font("Segoe UI", 8F, FontStyle.Regular),
                ForeColor = Color.DarkGray,
                Dock = DockStyle.Top,
                Height = 22
            };

            prgEnrollment = new ProgressBar
            {
                Dock = DockStyle.Top,
                Height = 12,
                Maximum = 100,
                Value = 0
            };

            lblTimer = new Label
            {
                Text = "⏱️ Time Remaining: 10.0s",
                Font = new Font("Segoe UI", 11F, FontStyle.Bold),
                ForeColor = Color.FromArgb(0, 210, 255),
                Location = new Point(18, 70),
                Width = 320,
                Height = 26
            };

            lblFrameStats = new Label
            {
                Text = "📸 Frames Collected: 0",
                Font = new Font("Segoe UI", 9F, FontStyle.Regular),
                ForeColor = Color.LightGray,
                Location = new Point(18, 98),
                Width = 320,
                Height = 20
            };

            lblInstruction = new Label
            {
                Text = "👉 Select employee above, align face in oval, and click 'START 10-SEC FACE SCAN'.",
                Font = new Font("Segoe UI", 9.5F, FontStyle.Italic),
                ForeColor = Color.FromArgb(0, 210, 255),
                Location = new Point(18, 126),
                Width = 320,
                Height = 46
            };

            lblQualityIndicator = new Label
            {
                Text = "Camera Status: Searching for Face...",
                Font = new Font("Segoe UI", 9F, FontStyle.Bold),
                ForeColor = Color.Gold,
                Location = new Point(18, 178),
                Width = 320,
                Height = 22
            };

            // Main Single Action Scan Button
            btnStartCalibration = new Button
            {
                Text = "⚡ START 10-SEC FACE SCAN",
                Font = new Font("Segoe UI", 10.5F, FontStyle.Bold),
                BackColor = Color.FromArgb(0, 122, 255),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Location = new Point(18, 210),
                Width = 320,
                Height = 48,
                Cursor = Cursors.Hand
            };
            btnStartCalibration.FlatAppearance.BorderSize = 0;
            btnStartCalibration.Click += (s, e) => ToggleCalibration();

            btnSaveSync = new Button
            {
                Text = "💾 SAVE & REGISTER TO DATABASE",
                Font = new Font("Segoe UI", 9.5F, FontStyle.Bold),
                BackColor = Color.FromArgb(16, 185, 129),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Location = new Point(18, 270),
                Width = 320,
                Height = 44,
                Enabled = false,
                Cursor = Cursors.Hand
            };
            btnSaveSync.FlatAppearance.BorderSize = 0;
            btnSaveSync.Click += async (s, e) => await SaveFaceRegistration();

            btnReset = new Button
            {
                Text = "🔄 Reset / Start Over",
                Font = new Font("Segoe UI", 9F),
                BackColor = Color.FromArgb(60, 65, 75),
                ForeColor = Color.LightGray,
                FlatStyle = FlatStyle.Flat,
                Location = new Point(18, 325),
                Width = 320,
                Height = 32,
                Cursor = Cursors.Hand
            };
            btnReset.FlatAppearance.BorderSize = 0;
            btnReset.Click += (s, e) => ResetEnrollment();

            pnlLeftWizard.Controls.Add(lblSequenceTitle);
            pnlLeftWizard.Controls.Add(lblSubtitle);
            pnlLeftWizard.Controls.Add(prgEnrollment);
            pnlLeftWizard.Controls.Add(lblTimer);
            pnlLeftWizard.Controls.Add(lblFrameStats);
            pnlLeftWizard.Controls.Add(lblInstruction);
            pnlLeftWizard.Controls.Add(lblQualityIndicator);
            pnlLeftWizard.Controls.Add(btnStartCalibration);
            pnlLeftWizard.Controls.Add(btnSaveSync);
            pnlLeftWizard.Controls.Add(btnReset);

            // Right Camera Viewport Panel
            pnlCameraViewport = new Panel
            {
                Dock = DockStyle.Fill,
                BackColor = Color.Black,
                Padding = new Padding(5)
            };

            picCamera = new PictureBox
            {
                Dock = DockStyle.Fill,
                SizeMode = PictureBoxSizeMode.Zoom,
                BackColor = Color.FromArgb(10, 12, 14)
            };
            pnlCameraViewport.Controls.Add(picCamera);

            tblLayout.Controls.Add(pnlLeftWizard, 0, 0);
            tblLayout.Controls.Add(pnlCameraViewport, 1, 0);

            this.Controls.Add(tblLayout);
            this.Controls.Add(pnlHeader);
        }

        public void UpdateEmployees(List<Store> stores, List<Employee> employees)
        {
            if (stores != null && stores.Count > 0) _stores = stores;
            if (employees != null && employees.Count > 0) _employees = employees;

            if (this.InvokeRequired)
            {
                this.BeginInvoke(new Action(PopulateDropdowns));
            }
            else
            {
                PopulateDropdowns();
            }
        }

        public void PopulateDropdowns()
        {
            cmbBranches.Items.Clear();
            cmbBranches.Items.Add("All Branches");
            if (_stores != null)
            {
                foreach (var s in _stores) cmbBranches.Items.Add(s.name);
            }
            cmbBranches.SelectedIndex = 0;

            // Fallback: If _employees is empty, load from LocalFaceStore so locally registered employees can always be searched
            if (_employees == null || _employees.Count == 0)
            {
                var localFaces = LocalFaceStore.GetEnrolledFaceDtos();
                if (localFaces != null && localFaces.Count > 0)
                {
                    _employees = new List<Employee>();
                    foreach (var lf in localFaces)
                    {
                        _employees.Add(new Employee
                        {
                            _id = lf._id,
                            code = lf.code,
                            name = lf.name,
                            branch = lf.branch
                        });
                    }
                }
            }

            FilterEmployees();
        }

        public void PopulateCameraDevices(bool preserveSelection = true)
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
                var cams = CameraManager.GetAvailableCameras();
                CameraDevice? match = null;
                foreach (var cam in cams)
                {
                    cmbCameras.Items.Add(cam);
                    if (cam.Index == prevIndex) match = cam;
                }

                // Prioritize external USB camera if connected
                if (match == null && cmbCameras.Items.Count > 0)
                {
                    match = cams.Find(c => c.IsExternal) ?? (CameraDevice)cmbCameras.Items[0];
                }

                if (match != null)
                {
                    cmbCameras.SelectedItem = match;
                }
                cmbCameras.EndUpdate();
            }
            catch (Exception ex)
            {
                Console.WriteLine("PopulateCameraDevices error: " + ex.Message);
            }
            finally
            {
                _isPopulatingCameras = false;
            }
        }

        private void FilterEmployees()
        {
            cmbEmployees.BeginUpdate();
            try
            {
                cmbEmployees.Items.Clear();
                string selectedBranch = cmbBranches.SelectedItem?.ToString();
                string query = txtSearchEmployee?.Text?.Trim() ?? string.Empty;

                // Default placeholder item
                var placeholderItem = new EmployeeComboItem { Employee = null, DisplayText = "-- Select Employee --" };
                cmbEmployees.Items.Add(placeholderItem);

                EmployeeComboItem exactCodeMatch = null;
                EmployeeComboItem exactNameMatch = null;
                EmployeeComboItem startsWithNameMatch = null;

                if (_employees != null)
                {
                    foreach (var emp in _employees)
                    {
                        if (selectedBranch == "All Branches" || emp.branch == selectedBranch)
                        {
                            bool matchesQuery = string.IsNullOrEmpty(query) ||
                                (emp.code != null && emp.code.IndexOf(query, StringComparison.OrdinalIgnoreCase) >= 0) ||
                                (emp.name != null && emp.name.IndexOf(query, StringComparison.OrdinalIgnoreCase) >= 0);

                            if (matchesQuery)
                            {
                                var item = new EmployeeComboItem { Employee = emp };
                                cmbEmployees.Items.Add(item);

                                if (!string.IsNullOrEmpty(query))
                                {
                                    if (string.Equals(emp.code, query, StringComparison.OrdinalIgnoreCase))
                                    {
                                        exactCodeMatch = item;
                                    }
                                    else if (string.Equals(emp.name, query, StringComparison.OrdinalIgnoreCase))
                                    {
                                        exactNameMatch = item;
                                    }
                                    else if (emp.name != null && emp.name.StartsWith(query, StringComparison.OrdinalIgnoreCase) && startsWithNameMatch == null)
                                    {
                                        startsWithNameMatch = item;
                                    }
                                }
                            }
                        }
                    }
                }

                if (exactCodeMatch != null)
                {
                    cmbEmployees.SelectedItem = exactCodeMatch;
                }
                else if (exactNameMatch != null)
                {
                    cmbEmployees.SelectedItem = exactNameMatch;
                }
                else if (startsWithNameMatch != null)
                {
                    cmbEmployees.SelectedItem = startsWithNameMatch;
                }
                else if (!string.IsNullOrEmpty(query) && cmbEmployees.Items.Count > 1)
                {
                    // Auto-select the first matching employee when searching!
                    cmbEmployees.SelectedIndex = 1;
                }
                else
                {
                    cmbEmployees.SelectedIndex = 0;
                }
            }
            finally
            {
                cmbEmployees.EndUpdate();
            }

            AutoSelectBranchForEmployee();
        }

        private bool _isAutoSelectingBranch = false;

        private void AutoSelectBranchForEmployee()
        {
            if (cmbEmployees.SelectedItem is EmployeeComboItem item && item.Employee != null)
            {
                string empBranch = item.Employee.branch;
                if (!string.IsNullOrEmpty(empBranch) && cmbBranches != null)
                {
                    for (int i = 0; i < cmbBranches.Items.Count; i++)
                    {
                        string bName = cmbBranches.Items[i]?.ToString() ?? "";
                        if (string.Equals(bName, empBranch, StringComparison.OrdinalIgnoreCase) ||
                            bName.IndexOf(empBranch, StringComparison.OrdinalIgnoreCase) >= 0 ||
                            empBranch.IndexOf(bName, StringComparison.OrdinalIgnoreCase) >= 0)
                        {
                            if (cmbBranches.SelectedIndex != i)
                            {
                                _isAutoSelectingBranch = true;
                                try
                                {
                                    cmbBranches.SelectedIndex = i;
                                }
                                finally
                                {
                                    _isAutoSelectingBranch = false;
                                }
                            }
                            break;
                        }
                    }
                }
            }
        }

        public void StartCamera()
        {
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
            _faceEngine?.ResetTracking();
            _cameraManager.Stop();
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

        private void ToggleCalibration()
        {
            if (_isCalibrating)
            {
                CancelCalibration("Calibration cancelled by user.");
            }
            else
            {
                StartCalibration();
            }
        }

        private void StartCalibration()
        {
            if (cmbEmployees.SelectedItem is not EmployeeComboItem chosenEmp || chosenEmp.Employee == null)
            {
                MessageBox.Show("Please select an employee from the dropdown at the top first.", "Select Employee", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            if (_lastFaceResult == null)
            {
                MessageBox.Show("No face detected in camera view.\n\nPlease position your face inside the green oval guide before starting calibration.", "No Face Detected", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            // Reset buffers
            _collectedEmbeddings.Clear();
            _anchorEmbedding = null;
            _bestFrontalYaw = 999f;
            _capturedAvatarBase64 = string.Empty;
            _frontCropBase64 = string.Empty;
            _leftCropBase64 = string.Empty;
            _rightCropBase64 = string.Empty;
            _lastSampleTime = DateTime.MinValue;

            _isCalibrating = true;
            _stopwatch.Restart();
            _calibrationTimer.Start();

            btnStartCalibration.Text = "⏹️ CANCEL FACE SCAN";
            btnStartCalibration.BackColor = Color.FromArgb(200, 50, 50);
            btnSaveSync.Enabled = false;
            cmbEmployees.Enabled = false;
            cmbBranches.Enabled = false;
            txtSearchEmployee.Enabled = false;

            lblInstruction.Text = "🟢 AI Face Scanning in progress... Move your face freely and naturally.";
            lblInstruction.ForeColor = Color.FromArgb(0, 210, 255);
        }

        private void CancelCalibration(string reason)
        {
            _calibrationTimer.Stop();
            _stopwatch.Stop();
            _isCalibrating = false;

            btnStartCalibration.Text = "⚡ START 10-SEC FACE SCAN";
            btnStartCalibration.BackColor = Color.FromArgb(0, 122, 255);
            cmbEmployees.Enabled = true;
            cmbBranches.Enabled = true;
            txtSearchEmployee.Enabled = true;

            lblInstruction.Text = $"⚠️ {reason}";
            lblInstruction.ForeColor = Color.Orange;
            prgEnrollment.Value = 0;
            lblTimer.Text = "⏱️ Time Remaining: 10.0s";
        }

        private void OnCalibrationTimerTick(object sender, EventArgs e)
        {
            if (!_isCalibrating) return;

            double elapsed = _stopwatch.Elapsed.TotalSeconds;
            if (elapsed > 10.0) elapsed = 10.0;

            int progress = (int)((elapsed / 10.0) * 100);
            prgEnrollment.Value = Math.Min(100, Math.Max(0, progress));

            double remaining = Math.Max(0.0, 10.0 - elapsed);
            lblTimer.Text = $"⏱️ Time Remaining: {remaining:F1}s";
            lblFrameStats.Text = $"📸 Frames Collected: {_collectedEmbeddings.Count}";

            if (elapsed >= 10.0)
            {
                _calibrationTimer.Stop();
                _stopwatch.Stop();
                _isCalibrating = false;
                FinishCalibration();
            }
        }

        private async void FinishCalibration()
        {
            btnStartCalibration.Text = "⚡ START 10-SEC FACE SCAN";
            btnStartCalibration.BackColor = Color.FromArgb(0, 122, 255);
            cmbEmployees.Enabled = true;
            cmbBranches.Enabled = true;
            txtSearchEmployee.Enabled = true;

            int totalValid = _collectedEmbeddings.Count;
            bool hasAvatar = !string.IsNullOrEmpty(_capturedAvatarBase64);

            // Validation: reject if face was lost or too few valid frames collected
            if (totalValid < 5 || !hasAvatar)
            {
                lblInstruction.Text = "⚠️ Incomplete: Face was not clearly visible. Please try again.";
                lblInstruction.ForeColor = Color.Tomato;
                System.Media.SystemSounds.Hand.Play();

                MessageBox.Show(
                    $"⚠️ Face Scan Incomplete\n\n" +
                    $"The AI camera could not collect enough reliable face frames:\n" +
                    $"• Valid Frames Collected: {totalValid} (Minimum required: 5)\n\n" +
                    $"Please keep your face clearly visible inside the camera guide and try again.",
                    "Face Scan Incomplete",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning
                );

                ResetEnrollment();
                return;
            }

            // Success!
            System.Media.SystemSounds.Exclamation.Play();
            lblInstruction.Text = $"🎉 10-Sec Scan Complete! Collected {totalValid} face frames. Registering...";
            lblInstruction.ForeColor = Color.FromArgb(16, 185, 129);
            prgEnrollment.Value = 100;

            btnSaveSync.Enabled = true;
            btnSaveSync.BackColor = Color.FromArgb(16, 185, 129);

            // Automatically save to local DB and cloud immediately
            await SaveFaceRegistration();
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
                var detected = _faceEngine.ProcessFrame(frame);
                if (detected != null && detected.Count > 0)
                {
                    _lastFaceResult = detected[0];

                    // ⚡ 10-SECOND CONTINUOUS FACE LEARNING SAMPLER:
                    // Automatically collects valid frames during the 10-second window while user moves freely
                    if (_isCalibrating && _lastFaceResult.Embedding != null && _lastFaceResult.Embedding.Count > 0)
                    {
                        // Throttled frame sampling (every ~100ms)
                        if ((DateTime.Now - _lastSampleTime).TotalMilliseconds >= 100)
                        {
                            _lastSampleTime = DateTime.Now;

                            // Quality check: Reject blurry, low-confidence, tiny, or unverified liveness frames
                            bool isQualityValid = _lastFaceResult.Confidence >= 0.65f &&
                                                  _lastFaceResult.HasLandmarks &&
                                                  _lastFaceResult.BoundingBox.Width >= 50 &&
                                                  _lastFaceResult.BoundingBox.Height >= 50 &&
                                                  _lastFaceResult.IsLive;

                            // 🔒 IDENTITY ANCHOR PROTECTION:
                            // The first sampled face belongs to the employee. Any secondary person entering the frame is strictly rejected!
                            if (isQualityValid)
                            {
                                if (_anchorEmbedding == null)
                                {
                                    _anchorEmbedding = new List<float>(_lastFaceResult.Embedding);
                                }
                                else
                                {
                                    float simToAnchor = FaceEngine.ComputeCosineSimilarity(_lastFaceResult.Embedding, _anchorEmbedding);
                                    if (simToAnchor < 0.55f)
                                    {
                                        // A different person (admin/bystander) entered camera frame!
                                        // Reject this frame so employee's avatar and template are never contaminated!
                                        isQualityValid = false;
                                    }
                                }
                            }

                            if (isQualityValid)
                            {
                                _collectedEmbeddings.Add(_lastFaceResult.Embedding);

                                float absYaw = Math.Abs(_lastFaceResult.YawDegrees);

                                // Automatically keep the cleanest frontal face as employee avatar (no wallpaper/blinds)
                                if (absYaw < _bestFrontalYaw || string.IsNullOrEmpty(_capturedAvatarBase64))
                                {
                                    _bestFrontalYaw = absYaw;
                                    try
                                    {
                                        using var crop = FaceEngine.ExtractFaceCrop(frame, _lastFaceResult.BoundingBox, 0.22f);
                                        if (crop != null)
                                        {
                                            string b64 = FaceEngine.ConvertBitmapToBase64Jpeg(crop, 88L);
                                            _capturedAvatarBase64 = b64;
                                            _frontCropBase64 = b64;
                                        }
                                    }
                                    catch { }
                                }

                                // Optional angle crops
                                if (_lastFaceResult.YawDegrees > 10.0f && string.IsNullOrEmpty(_leftCropBase64))
                                {
                                    try
                                    {
                                        using var crop = FaceEngine.ExtractFaceCrop(frame, _lastFaceResult.BoundingBox, 0.22f);
                                        if (crop != null) _leftCropBase64 = FaceEngine.ConvertBitmapToBase64Jpeg(crop, 88L);
                                    }
                                    catch { }
                                }
                                else if (_lastFaceResult.YawDegrees < -10.0f && string.IsNullOrEmpty(_rightCropBase64))
                                {
                                    try
                                    {
                                        using var crop = FaceEngine.ExtractFaceCrop(frame, _lastFaceResult.BoundingBox, 0.22f);
                                        if (crop != null) _rightCropBase64 = FaceEngine.ConvertBitmapToBase64Jpeg(crop, 88L);
                                    }
                                    catch { }
                                }
                            }
                        }
                    }
                }
                else
                {
                    _lastFaceResult = null;
                }

                // Render high-precision reticle, corner brackets, and landmarks (identical to Attendance Mode)
                Bitmap displayBitmap = RenderAnnotatedFrame(frame, _lastFaceResult);
                frame.Dispose();

                this.BeginInvoke(new Action(() =>
                {
                    try
                    {
                        if (this.IsDisposed || !this.Visible)
                        {
                            displayBitmap.Dispose();
                            return;
                        }

                        // Update live indicator badge with live pose label
                        if (_lastFaceResult != null)
                        {
                            lblQualityIndicator.Text = $"🟢 Live Face ({_lastFaceResult.PoseLabel})";
                            lblQualityIndicator.ForeColor = Color.FromArgb(16, 185, 129);
                        }
                        else
                        {
                            lblQualityIndicator.Text = "🔴 No Face Detected in Frame";
                            lblQualityIndicator.ForeColor = Color.Tomato;
                        }

                        var old = picCamera.Image;
                        picCamera.Image = displayBitmap;
                        old?.Dispose();
                    }
                    catch { }
                    finally
                    {
                        _isRenderingFrame = false;
                    }
                }));
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

                    // Draw Holographic Corner Brackets around Face (Exact same as FaceAttendanceView)
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

                    // Draw 5 Landmarks (YuNet)
                    if (face.HasLandmarks && face.Landmarks != null)
                    {
                        Color[] lmColors = new Color[]
                        {
                            Color.FromArgb(0, 255, 255), // Right Eye
                            Color.FromArgb(0, 255, 255), // Left Eye
                            Color.FromArgb(255, 215, 0), // Nose
                            Color.FromArgb(255, 80, 220), // Right Mouth
                            Color.FromArgb(255, 80, 220)  // Left Mouth
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

                // Top HUD Banner during 10-Second Calibration
                if (_isCalibrating)
                {
                    double elapsed = _stopwatch.Elapsed.TotalSeconds;
                    double remaining = Math.Max(0.0, 10.0 - elapsed);
                    string hudText = $"⚡ AI FACE SCAN: {remaining:F1}s | Frames: {_collectedEmbeddings.Count} | Move head naturally";

                    using var hudFont = new Font("Segoe UI", 12F, FontStyle.Bold);
                    using var hudBrush = new SolidBrush(Color.FromArgb(220, 20, 25, 35));
                    using var textBrush = new SolidBrush(Color.FromArgb(0, 220, 255));
                    var hudSz = g.MeasureString(hudText, hudFont);
                    int hudX = (original.Width - (int)hudSz.Width) / 2;
                    g.FillRectangle(hudBrush, hudX - 12, 14, (int)hudSz.Width + 24, (int)hudSz.Height + 8);
                    g.DrawString(hudText, hudFont, textBrush, hudX, 18);
                }
            }

            return output;
        }

        private async Task SaveFaceRegistration()
        {
            if (cmbEmployees.SelectedItem is not EmployeeComboItem item || item.Employee == null)
            {
                MessageBox.Show("Please select an employee first from the top dropdown.", "Select Employee", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            if (_collectedEmbeddings.Count < 5 || string.IsNullOrEmpty(_capturedAvatarBase64))
            {
                MessageBox.Show("Please complete the 10-second face scan before saving.", "Scan Incomplete", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            try
            {
                btnSaveSync.Enabled = false;
                btnSaveSync.Text = "SAVING FACE BIOMETRIC...";

                // Merge all multi-frame observations into ONE reliable, L2-normalized 128-D master template
                var compositeTemplate = FaceEngine.MergeAngleEmbeddings(_collectedEmbeddings);

                if (compositeTemplate == null || compositeTemplate.Count != 128 || compositeTemplate.Any(f => float.IsNaN(f) || float.IsInfinity(f)))
                {
                    MessageBox.Show("Face template generation failed: Invalid or incomplete facial vector. Please recalibrate with steady lighting.", "Registration Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    btnSaveSync.Enabled = true;
                    btnSaveSync.Text = "SAVE FACE BIOMETRIC";
                    return;
                }

                // 1. Client-side 1:N duplicate pre-check against existing enrolled faces in RAM (< 1ms)
                var enrolledFaces = LocalFaceStore.GetEnrolledFaceDtos();
                foreach (var enrolled in enrolledFaces)
                {
                    if (string.Equals(enrolled.code, item.Employee.code, StringComparison.OrdinalIgnoreCase) ||
                        (!string.IsNullOrEmpty(enrolled._id) && !string.IsNullOrEmpty(item.Employee._id) && enrolled._id == item.Employee._id))
                    {
                        continue; // Re-enrollment for the same employee is permitted
                    }

                    if (enrolled.faceTemplate != null && enrolled.faceTemplate.Count == 128)
                    {
                        float sim = FaceEngine.ComputeCosineSimilarity(compositeTemplate, enrolled.faceTemplate);
                        if (sim >= 0.55f)
                        {
                            MessageBox.Show(
                                $"⚠️ Biometric Duplicate Detected!\n\nThis facial scan matches already enrolled employee:\n" +
                                $"• Name: {enrolled.name}\n" +
                                $"• Code: {enrolled.code}\n" +
                                $"• Branch: {enrolled.branch}\n" +
                                $"• Similarity: {(sim * 100):F1}%\n\n" +
                                $"Duplicate face enrollment under employee {item.Employee.name} ({item.Employee.code}) is prohibited.",
                                "Biometric Ownership Conflict",
                                MessageBoxButtons.OK,
                                MessageBoxIcon.Warning
                            );
                            btnSaveSync.Enabled = true;
                            btnSaveSync.Text = "SAVE FACE BIOMETRIC";
                            return;
                        }
                    }
                }

                // 2. ATTEMPT CLOUD MONGODB SYNC FIRST (Authoritative Central Ownership Verification)
                bool cloudSuccess = false;
                string? serverErrorMessage = null;
                bool serverDuplicateDetected = false;

                if (_client != null && _config != null)
                {
                    try
                    {
                        var payload = new FaceRegisterRequest
                        {
                            employeeId = item.Employee._id,
                            employeeCode = item.Employee.code,
                            template = compositeTemplate,
                            facePhotoBase64 = _capturedAvatarBase64
                        };

                        var req = new HttpRequestMessage(HttpMethod.Post, "api/v1/attendance/biometric/face/register")
                        {
                            Content = JsonContent.Create(payload)
                        };
                        req.Headers.Add("bas-secret-key", _config.SecretKey);

                        var resp = await _client.SendAsync(req);
                        if (resp.IsSuccessStatusCode)
                        {
                            var result = await resp.Content.ReadFromJsonAsync<FaceRegisterResponse>();
                            if (result != null && result.success)
                            {
                                cloudSuccess = true;
                            }
                        }
                        else
                        {
                            // Parse backend error (e.g. HTTP 409 Conflict for duplicate face)
                            string body = await resp.Content.ReadAsStringAsync();
                            try
                            {
                                using var doc = System.Text.Json.JsonDocument.Parse(body);
                                if (doc.RootElement.TryGetProperty("message", out var msgProp))
                                {
                                    serverErrorMessage = msgProp.GetString();
                                }
                            }
                            catch { }

                            if (resp.StatusCode == System.Net.HttpStatusCode.Conflict)
                            {
                                serverDuplicateDetected = true;
                            }
                        }
                    }
                    catch (Exception netEx)
                    {
                        Console.WriteLine("Cloud face register dispatch error: " + netEx.Message);
                    }
                }

                // If central server detected a duplicate, abort immediately: NEVER save to local disk!
                if (serverDuplicateDetected)
                {
                    MessageBox.Show(
                        serverErrorMessage ?? "Biometric conflict: This face is already enrolled under another employee in the central database.",
                        "Server Biometric Duplicate Rejection",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Warning
                    );
                    btnSaveSync.Enabled = true;
                    btnSaveSync.Text = "SAVE FACE BIOMETRIC";
                    return;
                }

                if (cloudSuccess)
                {
                    MessageBox.Show(
                        $"✅ Success! Face registered directly to Central MongoDB Database for {item.Employee.name} ({item.Employee.code}).\n\n" +
                        $"• Collected {_collectedEmbeddings.Count} face observations across 10-sec scan\n" +
                        $"• Trained 128-D SFace biometric template generated\n" +
                        $"• Live biometric record saved in Central Database.\n\n" +
                        $"Ready for live attendance recognition across all branches!",
                        "Face Registration Complete",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information
                    );
                }
                else
                {
                    MessageBox.Show(
                        $"❌ Error: Failed to save face to central MongoDB database ({serverErrorMessage ?? "Network error"}).\n\nRegistration was NOT saved because local storage is disabled. Please verify server connection and retry.",
                        "Database Save Failed",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error
                    );
                    btnSaveSync.Enabled = true;
                    btnSaveSync.Text = "SAVE FACE BIOMETRIC";
                    return;
                }

                ResetEnrollment();
            }
            catch (Exception ex)
            {
                MessageBox.Show("Registration notice: " + ex.Message, "Notice", MessageBoxButtons.OK, MessageBoxIcon.Information);
                ResetEnrollment();
            }
            finally
            {
                btnSaveSync.Enabled = false;
                btnSaveSync.Text = "💾 SAVE & REGISTER TO DATABASE";
            }
        }

        private void ResetEnrollment()
        {
            _calibrationTimer?.Stop();
            _stopwatch.Reset();
            _isCalibrating = false;

            _collectedEmbeddings.Clear();
            _bestFrontalYaw = 999f;
            _capturedAvatarBase64 = string.Empty;
            _frontCropBase64 = string.Empty;
            _leftCropBase64 = string.Empty;
            _rightCropBase64 = string.Empty;

            prgEnrollment.Value = 0;
            lblTimer.Text = "⏱️ Time Remaining: 10.0s";
            lblFrameStats.Text = "📸 Frames Collected: 0";

            lblInstruction.Text = "👉 Select employee above, align face in oval, and click 'START 10-SEC FACE SCAN'.";
            lblInstruction.ForeColor = Color.FromArgb(0, 210, 255);

            btnStartCalibration.Enabled = true;
            btnStartCalibration.Text = "⚡ START 10-SEC FACE SCAN";
            btnStartCalibration.BackColor = Color.FromArgb(0, 122, 255);
            btnSaveSync.Enabled = false;

            cmbEmployees.Enabled = true;
            cmbBranches.Enabled = true;
            txtSearchEmployee.Enabled = true;
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                _calibrationTimer?.Stop();
                _calibrationTimer?.Dispose();
                _cameraManager?.Dispose();
                _faceEngine?.Dispose();
            }
            base.Dispose(disposing);
        }

        private class EmployeeComboItem
        {
            public Employee? Employee { get; set; }
            public string DisplayText { get; set; } = string.Empty;
            public override string ToString()
            {
                if (!string.IsNullOrEmpty(DisplayText)) return DisplayText;
                if (Employee != null) return $"{Employee.code} - {Employee.name}";
                return "-- Select Employee --";
            }
        }
    }

    public class FaceRegisterResponse
    {
        public bool success { get; set; }
        public string message { get; set; }
    }
}
