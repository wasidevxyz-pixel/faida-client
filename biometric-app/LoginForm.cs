using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Net.Http;
using System.Net.Http.Json;
using System.Net.Security;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace BarcodePrintingApp
{
    public partial class LoginForm : Form
    {
        private Config _config;
        private HttpClient _client;

        public string? Token { get; private set; }
        public UserData? User { get; private set; }
        public string? LastErrorMessage { get; private set; }

        public LoginForm()
        {
            InitializeComponent();
            _config = Config.Load();
            
            // Premium background and styling
            this.FormBorderStyle = FormBorderStyle.None;
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = Color.FromArgb(245, 247, 251);
            this.Size = new Size(400, 500);

            SetupModernUI();
        }

        private void SetupModernUI()
        {
            // Title Header with Gradient
            Panel pnlHeader = new Panel { Dock = DockStyle.Top, Height = 120 };
            pnlHeader.Paint += (s, e) => {
                using (var brush = new LinearGradientBrush(pnlHeader.ClientRectangle, Color.FromArgb(43, 88, 118), Color.FromArgb(78, 67, 118), 45F))
                {
                    e.Graphics.FillRectangle(brush, pnlHeader.ClientRectangle);
                }
                using (var font = new Font("Segoe UI Semibold", 18F))
                {
                    string title = "BAS BARCODE";
                    var size = e.Graphics.MeasureString(title, font);
                    e.Graphics.DrawString(title, font, Brushes.White, (pnlHeader.Width - size.Width) / 2, 35);
                }
                using (var font = new Font("Segoe UI", 10F))
                {
                    string sub = "Inventory & Printing System";
                    var size = e.Graphics.MeasureString(sub, font);
                    e.Graphics.DrawString(sub, font, Brushes.LightGray, (pnlHeader.Width - size.Width) / 2, 75);
                }
            };

            // Close Button
            Label lblClose = new Label { 
                Text = "×", Cursor = Cursors.Hand, 
                ForeColor = Color.White, BackColor = Color.Transparent, 
                Font = new Font("Arial", 18F, FontStyle.Bold),
                Location = new Point(370, 5), AutoSize = true
            };
            lblClose.Click += (s, e) => Application.Exit();
            pnlHeader.Controls.Add(lblClose);

            // Container for inputs
            Panel pnlContent = new Panel { 
                Location = new Point(40, 150), 
                Size = new Size(320, 300), 
                BackColor = Color.White 
            };
            RoundPanel(pnlContent, 20);

            Label lblLogin = new Label { Text = "User Login", Font = new Font("Segoe UI", 14F, FontStyle.Bold), ForeColor = Color.FromArgb(50, 50, 50), Location = new Point(20, 20), AutoSize = true };
            
            TextBox txtEmail = new TextBox { Name = "txtEmail", PlaceholderText = "Email or Name", Width = 280, Location = new Point(20, 70), Font = new Font("Segoe UI", 11F), BorderStyle = BorderStyle.FixedSingle };
            TextBox txtPass = new TextBox { Name = "txtPass", PlaceholderText = "Password", Width = 280, Location = new Point(20, 120), Font = new Font("Segoe UI", 11F), UseSystemPasswordChar = true, BorderStyle = BorderStyle.FixedSingle };

            Button btnLogin = new Button { 
                Name = "btnLogin", Text = "SIGN IN", 
                Width = 280, Height = 45, Location = new Point(20, 185),
                FlatStyle = FlatStyle.Flat, BackColor = Color.FromArgb(43, 88, 118), 
                ForeColor = Color.White, Font = new Font("Segoe UI Bold", 11F),
                Cursor = Cursors.Hand
            };
            btnLogin.FlatAppearance.BorderSize = 0;

            Label lblStatus = new Label { Name = "lblStatus", Text = "", ForeColor = Color.Crimson, Location = new Point(20, 240), Size = new Size(280, 40), Font = new Font("Segoe UI", 9F), TextAlign = ContentAlignment.TopCenter };

            btnLogin.Click += async (s, e) => {
                btnLogin.Enabled = false;
                btnLogin.Text = "Authenticating...";
                lblStatus.Text = "";
                
                bool success = await Authenticate(txtEmail.Text, txtPass.Text);
                if (success) {
                    this.DialogResult = DialogResult.OK;
                    this.Close();
                } else {
                    lblStatus.Text = LastErrorMessage ?? "Invalid login credentials.\nPlease try again.";
                    btnLogin.Enabled = true;
                    btnLogin.Text = "SIGN IN";
                }
            };

            pnlContent.Controls.AddRange(new Control[] { lblLogin, txtEmail, txtPass, btnLogin, lblStatus });

            this.Controls.Add(pnlContent);
            this.Controls.Add(pnlHeader);
        }

        private async Task<bool> Authenticate(string email, string password)
        {
            try
            {
                LastErrorMessage = null;
                // Force protocols that work with modern servers (Cloudflare) and old Windows
                System.Net.ServicePointManager.SecurityProtocol = 
                    System.Net.SecurityProtocolType.Tls12 | 
                    System.Net.SecurityProtocolType.Tls13;

                var handler = new HttpClientHandler();
                handler.SslProtocols = System.Security.Authentication.SslProtocols.None;
                handler.ServerCertificateCustomValidationCallback = (m, c, ch, errors) =>
                {
                    if (errors == System.Net.Security.SslPolicyErrors.None) return true;
                    if (m.RequestUri != null && (m.RequestUri.IsLoopback || m.RequestUri.Host == "localhost"))
                        return true;
                    return false;
                };
                handler.Proxy = null;
                handler.UseProxy = false;

                using var client = new HttpClient(handler);
                client.DefaultRequestHeaders.ConnectionClose = true;
                client.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) BarcodeApp/1.0");
                
                string baseUrl = _config.ServerUrl;
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
                        LastErrorMessage = errObj?.message ?? errObj?.error ?? "Login Failed (" + response.StatusCode + ")";
                    } catch {
                        LastErrorMessage = "Login Failed: " + response.StatusCode;
                    }
                }
            }
            catch (Exception ex)
            {
                LastErrorMessage = "Connection Error: " + ex.Message;
                if (ex.InnerException != null) LastErrorMessage += "\n" + ex.InnerException.Message;
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
