using System;
using System.Collections.Generic;
using System.Drawing;
using System.Windows.Forms;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading.Tasks;
using System.Text.Json;
using DPFP;
using DPFP.Capture;
using DPFP.Processing;

namespace BiometricApp
{
    public class EnrollmentForm : Form, DPFP.Capture.EventHandler
    {
        private string _employeeId;
        private string _employeeName;
        private string _secretKey;
        private HttpClient _client;
        private Dictionary<string, DPFP.Template>? _cachedTemplates;
        private List<Employee>? _allEmployees;
        private FeatureSet? _lastVerificationFeatures;
        private int _scanCount = 0;
        
        private Label lblName;
        private Label lblStatus;
        private Label lblCount;
        private PictureBox picFingerprint;
        private Button btnSave;
        private Panel pnlHeader;

        private Capture _capturer;
        private DPFP.Processing.Enrollment _enroller;
        private Template _template;

        public bool RegistrationSuccessful { get; private set; }

        public EnrollmentForm(string employeeId, string employeeName, string secretKey, HttpClient client)
            : this(employeeId, employeeName, secretKey, client, null, null)
        {
        }

        public EnrollmentForm(string employeeId, string employeeName, string secretKey, HttpClient client, Dictionary<string, DPFP.Template>? cachedTemplates, List<Employee>? allEmployees)
        {
            _employeeId = employeeId;
            _employeeName = employeeName;
            _secretKey = secretKey;
            _client = client;
            _cachedTemplates = cachedTemplates;
            _allEmployees = allEmployees;

            InitializeComponent();
            InitEnrollment();
        }

        private void InitEnrollment()
        {
            try {
                if (!Form1.IsDigitalPersonaDriverInstalled())
                {
                    MessageBox.Show("DigitalPersona driver (DPFPApi.dll) is not installed on this machine.\nPlease install the DigitalPersona OneTouch runtime driver or use Face AI Register.", "Hardware Driver Missing", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }

                _enroller = new DPFP.Processing.Enrollment();
                _capturer = new Capture();
                if (_capturer != null) {
                    _capturer.EventHandler = this;
                    _capturer.StartCapture();
                }
            } catch (Exception ex) {
                if (_capturer != null) {
                    try { GC.SuppressFinalize(_capturer); } catch { }
                    _capturer = null;
                }
                MessageBox.Show("Error initializing enrollment hardware: " + ex.Message);
            }
        }

        private void InitializeComponent()
        {
            this.Size = new Size(500, 550);
            this.Text = "Biometric Enrollment";
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.StartPosition = FormStartPosition.CenterParent;
            this.MaximizeBox = false;
            this.MinimizeBox = false;
            this.BackColor = Color.White;

            pnlHeader = new Panel { Dock = DockStyle.Top, Height = 60, BackColor = Color.FromArgb(13, 202, 240) };
            var lblHeader = new Label { 
                Text = "Register New Fingerprint", 
                ForeColor = Color.White, 
                Font = new Font("Segoe UI", 14, FontStyle.Bold),
                TextAlign = ContentAlignment.MiddleCenter,
                Dock = DockStyle.Fill
            };
            pnlHeader.Controls.Add(lblHeader);

            lblName = new Label { 
                Text = $"Employee: {_employeeName}", 
                Location = new Point(20, 70), 
                Size = new Size(460, 30),
                Font = new Font("Segoe UI", 12, FontStyle.Bold)
            };

            lblStatus = new Label { 
                Text = "Please place your finger on the sensor for the first scan.", 
                Location = new Point(20, 100), 
                Size = new Size(460, 40),
                Font = new Font("Segoe UI", 10),
                TextAlign = ContentAlignment.TopCenter
            };

            picFingerprint = new PictureBox {
                Location = new Point(150, 145),
                Size = new Size(200, 240),
                BorderStyle = BorderStyle.FixedSingle,
                SizeMode = PictureBoxSizeMode.Zoom,
                BackColor = Color.FromArgb(248, 249, 250)
            };

            lblCount = new Label { 
                Text = "0 / 4", 
                Location = new Point(20, 395), 
                Size = new Size(460, 50),
                Font = new Font("Segoe UI", 24, FontStyle.Bold),
                TextAlign = ContentAlignment.MiddleCenter,
                ForeColor = Color.FromArgb(13, 110, 253)
            };

            btnSave = new Button { 
                Text = "SAVE FINGERPRINT", 
                Location = new Point(100, 455), 
                Size = new Size(300, 45),
                BackColor = Color.FromArgb(25, 135, 84),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI", 10, FontStyle.Bold),
                Enabled = false // Disabled until 4 scans
            };
            btnSave.FlatAppearance.BorderSize = 0;
            btnSave.Click += BtnSave_Click;

            this.Controls.AddRange(new Control[] { pnlHeader, lblName, lblStatus, picFingerprint, lblCount, btnSave });
            
            this.FormClosing += (s, e) => _capturer?.StopCapture();
        }

        // --- DPFP.Capture.EventHandler Implementaton ---
        public void OnComplete(object Capture, string ReaderSerialNumber, Sample Sample)
        {
            ProcessScan(Sample);
        }

        public void OnFingerGone(object Capture, string ReaderSerialNumber) { }
        public void OnFingerTouch(object Capture, string ReaderSerialNumber) { }
        public void OnReaderConnect(object Capture, string ReaderSerialNumber) { }
        public void OnReaderDisconnect(object Capture, string ReaderSerialNumber) { }
        public void OnSampleQuality(object Capture, string ReaderSerialNumber, CaptureFeedback CaptureFeedback) { }

        private void ProcessScan(Sample sample)
        {
            // Convert sample to image and display
            try {
                var converter = new SampleConversion();
                Bitmap bitmap = null;
                converter.ConvertToPicture(sample, ref bitmap);
                if (bitmap != null) {
                    if (this.InvokeRequired) { this.Invoke(new Action(() => picFingerprint.Image = bitmap)); }
                    else { picFingerprint.Image = bitmap; }
                }
            } catch { }

            // Extract features
            try {
                var featureExtractor = new FeatureExtraction();
                var feedback = CaptureFeedback.Good;
                var features = new FeatureSet();
                featureExtractor.CreateFeatureSet(sample, DataPurpose.Enrollment, ref feedback, ref features);

                // Also extract verification features for 1:N pre-check against other enrolled employees
                var verExtractor = new FeatureExtraction();
                var verFeedback = CaptureFeedback.Good;
                var verFeatures = new FeatureSet();
                verExtractor.CreateFeatureSet(sample, DataPurpose.Verification, ref verFeedback, ref verFeatures);
                if (verFeedback == CaptureFeedback.Good)
                {
                    _lastVerificationFeatures = verFeatures;
                }

                if (feedback == CaptureFeedback.Good) {
                    _enroller.AddFeatures(features);
                    _scanCount++;

                    UpdateUIStatus();

                    if (_enroller.TemplateStatus == Enrollment.Status.Ready) {
                        _template = _enroller.Template;
                        _capturer.StopCapture();
                        EnableSaveButton();
                    }
                }
            } catch (Exception ex) {
                MessageBox.Show("Error processing scan: " + ex.Message);
            }
        }

        private void UpdateUIStatus()
        {
            if (this.InvokeRequired) { this.Invoke(new Action(UpdateUIStatus)); return; }

            lblCount.Text = $"{_scanCount} / 4";
            if (_scanCount < 4) {
                lblStatus.Text = $"Scan captured ({_scanCount}/4). Lift and place finger again.";
                lblStatus.ForeColor = Color.DarkBlue;
            } else {
                lblStatus.Text = "4 scans completed! Click Save to finish.";
                lblStatus.ForeColor = Color.DarkGreen;
            }
        }

        private Employee? CheckForDuplicateFingerprint()
        {
            if (_cachedTemplates == null || _allEmployees == null || _lastVerificationFeatures == null)
                return null;

            try
            {
                var verifier = new DPFP.Verification.Verification();
                foreach (var emp in _allEmployees)
                {
                    if (emp == null || emp._id == _employeeId) continue; // Same employee allowed
                    if (_cachedTemplates.TryGetValue(emp._id, out var otherTemplate))
                    {
                        var res = new DPFP.Verification.Verification.Result();
                        verifier.Verify(_lastVerificationFeatures, otherTemplate, ref res);
                        if (res.Verified)
                        {
                            return emp;
                        }
                    }
                }
            }
            catch { }

            return null;
        }

        private void EnableSaveButton()
        {
            if (this.InvokeRequired) { this.Invoke(new Action(EnableSaveButton)); return; }

            // Pre-flight 1:N check against cached templates in RAM (< 5ms)
            var duplicate = CheckForDuplicateFingerprint();
            if (duplicate != null)
            {
                lblStatus.Text = $"DUPLICATE REJECTED: Matches {duplicate.name} ({duplicate.code})!";
                lblStatus.ForeColor = Color.Red;
                btnSave.Enabled = false;
                btnSave.BackColor = Color.Gray;

                MessageBox.Show(
                    $"⚠️ Biometric Duplicate Detected!\n\nThis fingerprint is already registered to:\n" +
                    $"• Employee: {duplicate.name}\n" +
                    $"• Code: {duplicate.code}\n" +
                    $"• Branch: {duplicate.branch}\n\n" +
                    $"Duplicate biometric registration is strictly prohibited. Please enroll a different finger.",
                    "Biometric Duplicate Conflict",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning
                );
                return;
            }

            btnSave.Enabled = true;
            btnSave.BackColor = Color.FromArgb(40, 167, 69); // Brighter green
        }

        private async void BtnSave_Click(object sender, EventArgs e)
        {
            var duplicate = CheckForDuplicateFingerprint();
            if (duplicate != null)
            {
                MessageBox.Show(
                    $"Biometric conflict: This fingerprint belongs to {duplicate.name} (Code: {duplicate.code}). Cannot save.",
                    "Duplicate Biometric",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning
                );
                return;
            }

            lblStatus.Text = "Saving to server...";
            btnSave.Enabled = false;
            await SaveTemplate();
        }

        private async Task SaveTemplate()
        {
            try
            {
                if (_template == null) return;
                
                byte[] templateBytes = null;
                _template.Serialize(ref templateBytes);
                string base64Template = Convert.ToBase64String(templateBytes);
                
                _client.DefaultRequestHeaders.Remove("bas-secret-key");
                _client.DefaultRequestHeaders.Add("bas-secret-key", _secretKey);

                var payload = new { employeeId = _employeeId, template = base64Template };
                var response = await _client.PostAsJsonAsync("/api/v1/attendance/biometric/register", payload);

                if (response.IsSuccessStatusCode)
                {
                    RegistrationSuccessful = true;
                    MessageBox.Show($"Fingerprint successfully linked to {_employeeName}!", "Success", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    this.DialogResult = DialogResult.OK;
                    this.Close();
                }
                else
                {
                    string errorMsg = "Registration Failed: " + response.ReasonPhrase;
                    try
                    {
                        string body = await response.Content.ReadAsStringAsync();
                        using var doc = JsonDocument.Parse(body);
                        if (doc.RootElement.TryGetProperty("message", out var msgProp))
                        {
                            errorMsg = msgProp.GetString() ?? errorMsg;
                        }
                    }
                    catch { }

                    MessageBox.Show(errorMsg, "Biometric Duplicate / Registration Error", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    btnSave.Enabled = true;
                    lblStatus.Text = errorMsg;
                    lblStatus.ForeColor = Color.Red;
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Connection Error: " + ex.Message, "Network Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                btnSave.Enabled = true;
                lblStatus.Text = "Connection error. Please try again.";
                lblStatus.ForeColor = Color.Red;
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
