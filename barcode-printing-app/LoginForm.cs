using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace BarcodePrintingApp
{
    public partial class LoginForm : Form
    {
        private Config _config;

        public string? Token { get; private set; }
        public UserData? User { get; private set; }
        public string? LastErrorMessage { get; private set; }

        public LoginForm()
        {
            InitializeComponent();
            _config = Config.Load();
            
            this.FormBorderStyle = FormBorderStyle.None;
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = Color.FromArgb(245, 247, 251);
            this.Size = new Size(420, 525);

            SetupModernUI();
        }

        private void SetupModernUI()
        {
            // Title Header with Gradient
            Panel pnlHeader = new Panel { Dock = DockStyle.Top, Height = 95 };
            pnlHeader.Paint += (s, e) => {
                using (var brush = new LinearGradientBrush(pnlHeader.ClientRectangle, Color.FromArgb(43, 88, 118), Color.FromArgb(78, 67, 118), 45F))
                {
                    e.Graphics.FillRectangle(brush, pnlHeader.ClientRectangle);
                }
                using (var font = new Font("Segoe UI Semibold", 16F, FontStyle.Bold))
                {
                    string title = "BW-SOFTWARE AGENCY";
                    var size = e.Graphics.MeasureString(title, font);
                    e.Graphics.DrawString(title, font, Brushes.White, (pnlHeader.Width - size.Width) / 2, 22);
                }
                using (var font = new Font("Segoe UI", 9.5F))
                {
                    string sub = "Barcode Label & Thermal Printing System";
                    var size = e.Graphics.MeasureString(sub, font);
                    e.Graphics.DrawString(sub, font, Brushes.LightGray, (pnlHeader.Width - size.Width) / 2, 56);
                }
            };

            // Close Button
            Label lblClose = new Label { 
                Text = "×", Cursor = Cursors.Hand, 
                ForeColor = Color.White, BackColor = Color.Transparent, 
                Font = new Font("Arial", 18F, FontStyle.Bold),
                Location = new Point(390, 5), AutoSize = true
            };
            lblClose.Click += (s, e) => Application.Exit();
            pnlHeader.Controls.Add(lblClose);

            // Container for inputs (Clean, modern professional card)
            Panel pnlContent = new Panel { 
                Location = new Point(30, 110), 
                Size = new Size(360, 360), 
                BackColor = Color.White 
            };
            RoundPanel(pnlContent, 16);

            Label lblLogin = new Label { 
                Text = "Sign In to ERP", 
                Font = new Font("Segoe UI Bold", 14F), 
                ForeColor = Color.FromArgb(43, 88, 118), 
                Location = new Point(20, 20), 
                AutoSize = true 
            };

            Label lblEmail = new Label { 
                Text = "Email / Username:", 
                Location = new Point(20, 62), 
                AutoSize = true, 
                Font = new Font("Segoe UI Semibold", 9F), 
                ForeColor = Color.FromArgb(70, 70, 70) 
            };
            TextBox txtEmail = new TextBox { 
                Name = "txtEmail", 
                PlaceholderText = "Enter user login email or username", 
                Width = 320, 
                Location = new Point(20, 85), 
                Font = new Font("Segoe UI", 10.5F), 
                BorderStyle = BorderStyle.FixedSingle 
            };

            Label lblPass = new Label { 
                Text = "Password:", 
                Location = new Point(20, 130), 
                AutoSize = true, 
                Font = new Font("Segoe UI Semibold", 9F), 
                ForeColor = Color.FromArgb(70, 70, 70) 
            };
            TextBox txtPass = new TextBox { 
                Name = "txtPass", 
                PlaceholderText = "Enter password", 
                Width = 320, 
                Location = new Point(20, 153), 
                Font = new Font("Segoe UI", 10.5F), 
                UseSystemPasswordChar = true, 
                BorderStyle = BorderStyle.FixedSingle 
            };

            Button btnLogin = new Button { 
                Name = "btnLogin", Text = "SIGN IN", 
                Width = 320, Height = 44, Location = new Point(20, 210),
                FlatStyle = FlatStyle.Flat, BackColor = Color.FromArgb(43, 88, 118), 
                ForeColor = Color.White, Font = new Font("Segoe UI Bold", 11F),
                Cursor = Cursors.Hand
            };
            btnLogin.FlatAppearance.BorderSize = 0;

            txtEmail.KeyDown += (s, e) => { if (e.KeyCode == Keys.Enter) txtPass.Focus(); };
            txtPass.KeyDown += (s, e) => { if (e.KeyCode == Keys.Enter) btnLogin.PerformClick(); };

            Label lblStatus = new Label { 
                Name = "lblStatus", 
                Text = "", 
                ForeColor = Color.Crimson, 
                Location = new Point(20, 268), 
                Size = new Size(320, 80), 
                Font = new Font("Segoe UI", 8.5F), 
                TextAlign = ContentAlignment.TopCenter 
            };

            btnLogin.Click += async (s, e) => {
                btnLogin.Enabled = false;
                btnLogin.Text = "Authenticating...";
                lblStatus.ForeColor = Color.FromArgb(43, 88, 118);
                lblStatus.Text = "Signing in to ERP system...";

                bool success = await Authenticate(txtEmail.Text, txtPass.Text);
                if (success) {
                    Config.Save(_config);
                    this.DialogResult = DialogResult.OK;
                    this.Close();
                } else {
                    lblStatus.ForeColor = Color.Crimson;
                    lblStatus.Text = LastErrorMessage ?? "Invalid login credentials.\nPlease check email & password.";
                    btnLogin.Enabled = true;
                    btnLogin.Text = "SIGN IN";
                }
            };

            pnlContent.Controls.AddRange(new Control[] { 
                lblLogin, lblEmail, txtEmail, lblPass, txtPass, btnLogin, lblStatus 
            });

            Label lblFooter = new Label
            {
                Text = "SOFTWARE DEVELOPED BY BW-SOFTWARE AGENCY\nCONTACT: +923192173398",
                Font = new Font("Segoe UI", 7.8F, FontStyle.Bold),
                ForeColor = Color.FromArgb(120, 130, 145),
                TextAlign = ContentAlignment.MiddleCenter,
                Location = new Point(20, 480),
                Size = new Size(380, 36)
            };

            this.Controls.Add(lblFooter);
            this.Controls.Add(pnlContent);
            this.Controls.Add(pnlHeader);
        }

        private async Task<bool> Authenticate(string email, string password)
        {
            try
            {
                LastErrorMessage = null;
                System.Net.ServicePointManager.SecurityProtocol = 
                    System.Net.SecurityProtocolType.Tls12 | 
                    System.Net.SecurityProtocolType.Tls13;

                var handler = new HttpClientHandler();
                handler.SslProtocols = System.Security.Authentication.SslProtocols.None;
                handler.ServerCertificateCustomValidationCallback = (m, c, ch, e) => true;
                handler.Proxy = null;
                handler.UseProxy = false;

                using var client = new HttpClient(handler);
                client.Timeout = TimeSpan.FromSeconds(15);
                client.DefaultRequestHeaders.ConnectionClose = true;
                client.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) BarcodeApp/1.0");
                client.DefaultRequestHeaders.Add("ngrok-skip-browser-warning", "69420");
                
                string baseUrl = (_config.ServerUrl ?? "").Trim();
                if (!baseUrl.StartsWith("http://", StringComparison.OrdinalIgnoreCase) && 
                    !baseUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
                {
                    baseUrl = "https://" + baseUrl;
                }

                if (!baseUrl.EndsWith("/")) baseUrl += "/";
                client.BaseAddress = new Uri(baseUrl);
                
                var loginData = new LoginRequest { email = email.Trim(), password = password };
                var response = await client.PostAsJsonAsync("api/v1/auth/login", loginData);

                if (response.IsSuccessStatusCode)
                {
                    var result = await response.Content.ReadFromJsonAsync<LoginResponse>();
                    if (result?.success == true)
                    {
                        this.Token = result.token;
                        this.User = result.user;
                        return true;
                    }
                }
                else 
                {
                    string error = await response.Content.ReadAsStringAsync();
                    try {
                        var errObj = Newtonsoft.Json.JsonConvert.DeserializeObject<dynamic>(error);
                        LastErrorMessage = errObj?.message ?? errObj?.error ?? errObj?.errors?[0]?.msg ?? $"Login Failed ({response.StatusCode})";
                    } catch {
                        LastErrorMessage = $"Login Failed ({response.StatusCode}):\n{error}";
                    }
                }
            }
            catch (Exception ex)
            {
                LastErrorMessage = "Connection Error: " + ex.Message;
                if (ex.InnerException != null) LastErrorMessage += "\n" + ex.InnerException.Message;
                LastErrorMessage += $"\nAttempted: {_config.ServerUrl}";
            }
            return false;
        }

        private void RoundPanel(Panel pnl, int radius)
        {
            GraphicsPath path = new GraphicsPath();
            path.AddArc(0, 0, radius, radius, 180, 90);
            path.AddArc(pnl.Width - radius, 0, radius, radius, 270, 90);
            path.AddArc(pnl.Width - radius, pnl.Height - radius, radius, radius, 0, 90);
            path.AddArc(0, pnl.Height - radius, radius, radius, 90, 90);
            path.CloseFigure();
            pnl.Region = new Region(path);
        }
    }
}
