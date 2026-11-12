namespace BiometricApp
{
    partial class Form1
    {
        private System.ComponentModel.IContainer components = null;

        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
            {
                components.Dispose();
            }
            base.Dispose(disposing);
        }

        private void InitializeComponent()
        {
            this.components = new System.ComponentModel.Container();
            this.pnlSidebar = new System.Windows.Forms.Panel();
            this.pnlContent = new System.Windows.Forms.Panel();
            this.lblAppTitle = new System.Windows.Forms.Label();
            this.btnNavAttendance = new System.Windows.Forms.Button();
            this.btnNavRegister = new System.Windows.Forms.Button();
            this.btnNavFaceAttendance = new System.Windows.Forms.Button();
            this.btnNavFaceRegister = new System.Windows.Forms.Button();
            this.btnNavFaceDiagnostic = new System.Windows.Forms.Button();
            this.btnLogout = new System.Windows.Forms.Button();
            this.viewFaceAttendance = new FaceAttendanceView();
            this.viewFaceRegister = new FaceRegisterView();
            this.viewFaceDiagnostic = new FaceDiagnosticView();
            this.lblActiveBranch = new System.Windows.Forms.Label();
            this.pnlLogin = new System.Windows.Forms.Panel();
            this.pnlLoginLeft = new System.Windows.Forms.Panel();
            this.pnlLoginRight = new System.Windows.Forms.Panel();
            this.lblLoginLeftLogo = new System.Windows.Forms.Label();
            this.lblLoginLeftTitle = new System.Windows.Forms.Label();
            this.lblLoginLeftDesc = new System.Windows.Forms.Label();
            this.lblLoginTitle = new System.Windows.Forms.Label();
            this.lblLoginSubtitle = new System.Windows.Forms.Label();
            this.lblEmailLabel = new System.Windows.Forms.Label();
            this.txtEmail = new System.Windows.Forms.TextBox();
            this.lblPasswordLabel = new System.Windows.Forms.Label();
            this.txtPassword = new System.Windows.Forms.TextBox();
            this.lblBranchLabel = new System.Windows.Forms.Label(); // CREATE BRANCH LABEL
            this.cmbAttendanceBranch = new System.Windows.Forms.ComboBox(); // CREATE BRANCH DROPDOWN
            this.chkRememberMe = new System.Windows.Forms.CheckBox();
            this.lblForgotPassword = new System.Windows.Forms.Label();
            this.btnLogin = new System.Windows.Forms.Button();
            this.lblLoginFooter = new System.Windows.Forms.Label();
            
            this.viewAttendance = new System.Windows.Forms.Panel();
            this.viewRegister = new System.Windows.Forms.Panel();
            
            this.cmbRegBranches = new System.Windows.Forms.ComboBox();
            this.cmbRegEmployees = new System.Windows.Forms.ComboBox();
            this.btnOpenEnrollment = new System.Windows.Forms.Button();
            this.lblRegStatus = new System.Windows.Forms.Label();
            this.lblRegInstructor = new System.Windows.Forms.Label();
            this.lblRegBranch = new System.Windows.Forms.Label();
            this.lblRegSearch = new System.Windows.Forms.Label();
            this.txtRegSearch = new System.Windows.Forms.TextBox();
            this.btnRegClearSearch = new System.Windows.Forms.Button();
            this.lblRegEmployee = new System.Windows.Forms.Label();
            
            this.lblScannerStatus = new System.Windows.Forms.Label();
            this.pnlScannerStatus = new System.Windows.Forms.Panel();
            this.lblReadyToScan = new System.Windows.Forms.Label();
            this.picAttendanceFinger = new System.Windows.Forms.PictureBox();
            this.lblscanInstruction = new System.Windows.Forms.Label();
            
            this.lblSuccessName = new System.Windows.Forms.Label();
            this.lblSuccessCode = new System.Windows.Forms.Label();
            this.lblSuccessStatus = new System.Windows.Forms.Label();
            this.lblSuccessTime = new System.Windows.Forms.Label();
            this.picSuccessProfile = new System.Windows.Forms.PictureBox();
            
            this.tblAttendanceMain = new System.Windows.Forms.TableLayoutPanel();
            this.tblAttendanceLeft = new System.Windows.Forms.TableLayoutPanel();
            this.pnlAttendanceRightContent = new System.Windows.Forms.FlowLayoutPanel(); // Use Flow for centering non-stretch items
            this.pnlManualTest = new System.Windows.Forms.FlowLayoutPanel();
            this.lblWaitPlaceholder = new System.Windows.Forms.Label();
            this.lblLiveDateTime = new System.Windows.Forms.Label();
            this.resetTimer = new System.Windows.Forms.Timer(this.components);
            this.timerLiveClock = new System.Windows.Forms.Timer(this.components);


            // -- Sidebar --
            this.pnlSidebar.BackColor = System.Drawing.Color.FromArgb(33, 37, 41);
            this.pnlSidebar.Dock = System.Windows.Forms.DockStyle.Left;
            this.pnlSidebar.Width = 220;
            this.pnlSidebar.Visible = false;

            this.lblAppTitle.ForeColor = System.Drawing.Color.White;
            this.lblAppTitle.Font = new System.Drawing.Font("Segoe UI", 14F, System.Drawing.FontStyle.Bold);
            this.lblAppTitle.Text = "BAS BIOMETRIC";
            this.lblAppTitle.Location = new System.Drawing.Point(10, 25);
            this.lblAppTitle.AutoSize = true;

            this.btnNavAttendance.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.btnNavAttendance.ForeColor = System.Drawing.Color.White;
            this.btnNavAttendance.Text = " Attendance Mode";
            this.btnNavAttendance.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;
            this.btnNavAttendance.Location = new System.Drawing.Point(0, 100);
            this.btnNavAttendance.Size = new System.Drawing.Size(220, 50);
            this.btnNavAttendance.FlatAppearance.BorderSize = 0;
            this.btnNavAttendance.Click += (s, e) => ShowView("attendance");

            this.btnNavRegister.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.btnNavRegister.ForeColor = System.Drawing.Color.White;
            this.btnNavRegister.Text = " Biometric Register";
            this.btnNavRegister.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;
            this.btnNavRegister.Location = new System.Drawing.Point(0, 150);
            this.btnNavRegister.Size = new System.Drawing.Size(220, 50);
            this.btnNavRegister.FlatAppearance.BorderSize = 0;
            this.btnNavRegister.Click += (s, e) => ShowView("register");

            this.btnNavFaceAttendance.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.btnNavFaceAttendance.ForeColor = System.Drawing.Color.White;
            this.btnNavFaceAttendance.Text = " 📸 Face Attendance";
            this.btnNavFaceAttendance.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;
            this.btnNavFaceAttendance.Location = new System.Drawing.Point(0, 200);
            this.btnNavFaceAttendance.Size = new System.Drawing.Size(220, 50);
            this.btnNavFaceAttendance.FlatAppearance.BorderSize = 0;
            this.btnNavFaceAttendance.Click += (s, e) => ShowView("face-attendance");

            this.btnNavFaceRegister.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.btnNavFaceRegister.ForeColor = System.Drawing.Color.White;
            this.btnNavFaceRegister.Text = " 👤 Face AI Register";
            this.btnNavFaceRegister.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;
            this.btnNavFaceRegister.Location = new System.Drawing.Point(0, 250);
            this.btnNavFaceRegister.Size = new System.Drawing.Size(220, 50);
            this.btnNavFaceRegister.FlatAppearance.BorderSize = 0;
            this.btnNavFaceRegister.Click += (s, e) => ShowView("face-register");

            this.btnNavFaceDiagnostic.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.btnNavFaceDiagnostic.ForeColor = System.Drawing.Color.White;
            this.btnNavFaceDiagnostic.Text = " 🔬 AI Vision Diagnostic";
            this.btnNavFaceDiagnostic.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;
            this.btnNavFaceDiagnostic.Location = new System.Drawing.Point(0, 300);
            this.btnNavFaceDiagnostic.Size = new System.Drawing.Size(220, 50);
            this.btnNavFaceDiagnostic.FlatAppearance.BorderSize = 0;
            this.btnNavFaceDiagnostic.Click += (s, e) => ShowView("diagnostic");

            this.btnLogout.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.btnLogout.ForeColor = System.Drawing.Color.FromArgb(255, 100, 100);
            this.btnLogout.Text = " Logout";
            this.btnLogout.Dock = System.Windows.Forms.DockStyle.Bottom;
            this.btnLogout.Size = new System.Drawing.Size(220, 50);
            this.btnLogout.FlatAppearance.BorderSize = 0;
            this.btnLogout.Click += (s, e) => Logout();

            this.pnlSidebar.Controls.AddRange(new System.Windows.Forms.Control[] { 
                this.lblAppTitle, 
                this.btnNavAttendance, 
                this.btnNavRegister, 
                this.btnNavFaceAttendance, 
                this.btnNavFaceRegister, 
                this.btnNavFaceDiagnostic,
                this.btnLogout 
            });

            // -- Content Area --
            this.pnlContent.Dock = System.Windows.Forms.DockStyle.Fill;
            this.pnlContent.BackColor = System.Drawing.Color.WhiteSmoke;

            // -- Login View (Large Card Style) --
            this.pnlLogin.Size = new System.Drawing.Size(850, 500);
            this.pnlLogin.BackColor = System.Drawing.Color.White;
            
            this.pnlLoginLeft.Dock = System.Windows.Forms.DockStyle.Left;
            this.pnlLoginLeft.Width = 425;
            this.pnlLoginLeft.Paint += new System.Windows.Forms.PaintEventHandler(this.pnlLoginLeft_Paint);

            this.lblLoginLeftLogo.BackColor = System.Drawing.Color.Transparent;
            this.lblLoginLeftLogo.Text = "\uE928"; // Fingerprint Icon
            this.lblLoginLeftLogo.Font = new System.Drawing.Font("Segoe MDL2 Assets", 48F);
            this.lblLoginLeftLogo.ForeColor = System.Drawing.Color.White;
            this.lblLoginLeftLogo.Location = new System.Drawing.Point(0, 80);
            this.lblLoginLeftLogo.Size = new System.Drawing.Size(425, 100);
            this.lblLoginLeftLogo.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;

            this.lblLoginLeftTitle.BackColor = System.Drawing.Color.Transparent;
            this.lblLoginLeftTitle.Text = "Bilal\nAttendance\nSystem (BAS)";
            this.lblLoginLeftTitle.Font = new System.Drawing.Font("Segoe UI", 28F, System.Drawing.FontStyle.Bold);
            this.lblLoginLeftTitle.ForeColor = System.Drawing.Color.White;
            this.lblLoginLeftTitle.Location = new System.Drawing.Point(0, 180);
            this.lblLoginLeftTitle.Size = new System.Drawing.Size(425, 180);
            this.lblLoginLeftTitle.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;

            this.lblLoginLeftDesc.BackColor = System.Drawing.Color.Transparent;
            this.lblLoginLeftDesc.Text = "Manage your business efficiently with our\ncomprehensive solution.";
            this.lblLoginLeftDesc.Font = new System.Drawing.Font("Segoe UI", 11F);
            this.lblLoginLeftDesc.ForeColor = System.Drawing.Color.FromArgb(230, 230, 255);
            this.lblLoginLeftDesc.Location = new System.Drawing.Point(0, 360);
            this.lblLoginLeftDesc.Size = new System.Drawing.Size(425, 60);
            this.lblLoginLeftDesc.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;

            this.pnlLoginLeft.Controls.AddRange(new System.Windows.Forms.Control[] { this.lblLoginLeftLogo, this.lblLoginLeftTitle, this.lblLoginLeftDesc });

            this.pnlLoginRight.Dock = System.Windows.Forms.DockStyle.Fill;
            this.pnlLoginRight.BackColor = System.Drawing.Color.White;
            this.pnlLoginRight.Padding = new System.Windows.Forms.Padding(40);

            this.lblLoginTitle.Text = "Welcome Back";
            this.lblLoginTitle.Font = new System.Drawing.Font("Segoe UI Semibold", 22F, System.Drawing.FontStyle.Bold);
            this.lblLoginTitle.Location = new System.Drawing.Point(40, 60);
            this.lblLoginTitle.AutoSize = true;
            this.lblLoginTitle.ForeColor = System.Drawing.Color.FromArgb(50, 50, 50);

            this.lblLoginSubtitle.Text = "Please enter your details to sign in.";
            this.lblLoginSubtitle.Font = new System.Drawing.Font("Segoe UI", 10F);
            this.lblLoginSubtitle.ForeColor = System.Drawing.Color.Gray;
            this.lblLoginSubtitle.Location = new System.Drawing.Point(40, 105);
            this.lblLoginSubtitle.AutoSize = true;

            this.lblEmailLabel.Text = "Login ID";
            this.lblEmailLabel.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Bold);
            this.lblEmailLabel.ForeColor = System.Drawing.Color.FromArgb(100, 100, 100);
            this.lblEmailLabel.Location = new System.Drawing.Point(40, 145);
            this.lblEmailLabel.AutoSize = true;

            this.txtEmail.PlaceholderText = "";
            this.txtEmail.BackColor = System.Drawing.Color.FromArgb(235, 242, 255);
            this.txtEmail.BorderStyle = System.Windows.Forms.BorderStyle.None;
            this.txtEmail.Font = new System.Drawing.Font("Segoe UI", 12F);
            this.txtEmail.Location = new System.Drawing.Point(40, 165);
            this.txtEmail.Size = new System.Drawing.Size(345, 30);
            // Hack to add padding visually (cannot do real padding on TextBox easily without panel)
            
            this.lblPasswordLabel.Text = "Password";
            this.lblPasswordLabel.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Bold);
            this.lblPasswordLabel.ForeColor = System.Drawing.Color.FromArgb(100, 100, 100);
            this.lblPasswordLabel.Location = new System.Drawing.Point(40, 205);
            this.lblPasswordLabel.AutoSize = true;

            this.txtPassword.BackColor = System.Drawing.Color.FromArgb(235, 242, 255);
            this.txtPassword.BorderStyle = System.Windows.Forms.BorderStyle.None;
            this.txtPassword.Font = new System.Drawing.Font("Segoe UI", 12F);
            this.txtPassword.Location = new System.Drawing.Point(40, 220);
            this.txtPassword.Size = new System.Drawing.Size(345, 30);
            this.txtPassword.UseSystemPasswordChar = true;

            // Branch Selector on Login Page
            this.lblBranchLabel = new System.Windows.Forms.Label();
            this.lblBranchLabel.Text = "Select Branch Location";
            this.lblBranchLabel.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Bold);
            this.lblBranchLabel.ForeColor = System.Drawing.Color.FromArgb(100, 100, 100);
            this.lblBranchLabel.Location = new System.Drawing.Point(40, 255);
            this.lblBranchLabel.AutoSize = true;

            this.cmbAttendanceBranch.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
            this.cmbAttendanceBranch.Font = new System.Drawing.Font("Segoe UI", 11F);
            this.cmbAttendanceBranch.FormattingEnabled = true;
            this.cmbAttendanceBranch.Location = new System.Drawing.Point(40, 275);
            this.cmbAttendanceBranch.Size = new System.Drawing.Size(345, 35);
            this.cmbAttendanceBranch.Name = "cmbAttendanceBranch";
            this.cmbAttendanceBranch.BackColor = System.Drawing.Color.White;
            this.cmbAttendanceBranch.ForeColor = System.Drawing.Color.Black;
            this.cmbAttendanceBranch.FlatStyle = System.Windows.Forms.FlatStyle.Standard;

            this.chkRememberMe.Text = "Remember me";
            this.chkRememberMe.Location = new System.Drawing.Point(40, 320);
            this.chkRememberMe.AutoSize = true;
            this.chkRememberMe.ForeColor = System.Drawing.Color.Gray;

            this.lblForgotPassword.Text = "Forgot Password?";
            this.lblForgotPassword.ForeColor = System.Drawing.Color.FromArgb(120, 100, 200);
            this.lblForgotPassword.Location = new System.Drawing.Point(260, 320);
            this.lblForgotPassword.AutoSize = true;
            this.lblForgotPassword.Cursor = System.Windows.Forms.Cursors.Hand;

            this.btnLogin.Text = "Sign In  →";
            this.btnLogin.BackColor = System.Drawing.Color.FromArgb(100, 105, 205);
            this.btnLogin.ForeColor = System.Drawing.Color.White;
            this.btnLogin.Location = new System.Drawing.Point(40, 355);
            this.btnLogin.Width = 345;
            this.btnLogin.Height = 45;
            this.btnLogin.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.btnLogin.FlatAppearance.BorderSize = 0;
            this.btnLogin.Font = new System.Drawing.Font("Segoe UI", 11F, System.Drawing.FontStyle.Bold);
            this.btnLogin.Click += new System.EventHandler(this.btnLogin_Click);

            this.lblLoginFooter.Text = "This software is designed by Bilal Shah | 📞 0348-5511763";
            this.lblLoginFooter.Font = new System.Drawing.Font("Segoe UI", 8F);
            this.lblLoginFooter.ForeColor = System.Drawing.Color.Gray;
            this.lblLoginFooter.Location = new System.Drawing.Point(0, 425);
            this.lblLoginFooter.Size = new System.Drawing.Size(425, 30);
            this.lblLoginFooter.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;

            this.pnlLoginRight.Controls.AddRange(new System.Windows.Forms.Control[] { 
                this.lblLoginTitle, this.lblLoginSubtitle, 
                this.lblEmailLabel, this.txtEmail, 
                this.lblPasswordLabel, this.txtPassword, 
                this.lblBranchLabel, this.cmbAttendanceBranch,
                this.chkRememberMe, this.lblForgotPassword, this.btnLogin, this.lblLoginFooter 
            });

            this.pnlLogin.Controls.AddRange(new System.Windows.Forms.Control[] { this.pnlLoginRight, this.pnlLoginLeft });

            // -- Attendance View --
            this.viewAttendance.Dock = System.Windows.Forms.DockStyle.Fill;
            this.viewAttendance.Visible = false;

            this.lblActiveBranch.Text = "BRANCH: NOT SELECTED";
            this.lblActiveBranch.Font = new System.Drawing.Font("Segoe UI", 12F, System.Drawing.FontStyle.Bold);
            this.lblActiveBranch.ForeColor = System.Drawing.Color.FromArgb(50, 50, 50);
            this.lblActiveBranch.BackColor = System.Drawing.Color.FromArgb(240, 240, 240);
            this.lblActiveBranch.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
            this.lblActiveBranch.Dock = DockStyle.Fill;
            this.lblActiveBranch.Margin = new Padding(0);

            // 50/50 main split
            this.tblAttendanceMain.Dock = DockStyle.Fill;
            this.tblAttendanceMain.ColumnCount = 2;
            this.tblAttendanceMain.RowCount = 1;
            this.tblAttendanceMain.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50F));
            this.tblAttendanceMain.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50F));
            this.tblAttendanceMain.BackColor = Color.White;

            // LEFT PANEL rows
            this.tblAttendanceLeft.Dock = DockStyle.Fill;
            this.tblAttendanceLeft.ColumnCount = 1;
            this.tblAttendanceLeft.RowCount = 6;
            this.tblAttendanceLeft.RowStyles.Add(new RowStyle(SizeType.Absolute, 40F));   // Branch bar
            this.tblAttendanceLeft.RowStyles.Add(new RowStyle(SizeType.Absolute, 40F));   // Scanner status
            this.tblAttendanceLeft.RowStyles.Add(new RowStyle(SizeType.Absolute, 50F));   // Clock
            this.tblAttendanceLeft.RowStyles.Add(new RowStyle(SizeType.Absolute, 190F));  // Fingerprint (fixed)
            this.tblAttendanceLeft.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));   // Scan status text
            this.tblAttendanceLeft.RowStyles.Add(new RowStyle(SizeType.Absolute, 60F));   // Manual Switch to Face AI Backup
            this.tblAttendanceLeft.BackColor = Color.White;

            this.pnlScannerStatus.Dock = DockStyle.Fill;
            this.pnlScannerStatus.Margin = new Padding(0);

            this.lblScannerStatus.Dock = DockStyle.Fill;
            this.lblScannerStatus.TextAlign = ContentAlignment.MiddleCenter;
            this.lblScannerStatus.Font = new Font("Segoe UI", 10f, FontStyle.Bold);
            this.lblScannerStatus.Text = "Scanner: Initializing...";
            this.pnlScannerStatus.Controls.Add(this.lblScannerStatus);

            this.lblLiveDateTime.Dock = DockStyle.Fill;
            this.lblLiveDateTime.TextAlign = ContentAlignment.MiddleCenter;
            this.lblLiveDateTime.Font = new Font("Segoe UI", 16f, FontStyle.Bold);

            this.picAttendanceFinger.Dock = DockStyle.None;
            this.picAttendanceFinger.Anchor = AnchorStyles.None;
            this.picAttendanceFinger.Size = new Size(160, 190);
            this.picAttendanceFinger.BorderStyle = BorderStyle.FixedSingle;
            this.picAttendanceFinger.BackColor = Color.FromArgb(245, 245, 245);
            this.picAttendanceFinger.SizeMode = PictureBoxSizeMode.Zoom;

            this.lblReadyToScan.Dock = DockStyle.Fill;
            this.lblReadyToScan.TextAlign = ContentAlignment.MiddleCenter;
            this.lblReadyToScan.Font = new Font("Segoe UI", 18f, FontStyle.Bold);
            this.lblReadyToScan.ForeColor = Color.FromArgb(80, 80, 80);

            this.lblscanInstruction.Dock = DockStyle.Fill;
            this.lblscanInstruction.TextAlign = ContentAlignment.MiddleCenter;

            this.btnSwitchToFaceManual = new System.Windows.Forms.Button();
            this.btnSwitchToFaceManual.Text = "📸 SWITCH TO FACE AI BACKUP";
            this.btnSwitchToFaceManual.Font = new Font("Segoe UI", 11F, FontStyle.Bold);
            this.btnSwitchToFaceManual.BackColor = Color.FromArgb(13, 110, 253);
            this.btnSwitchToFaceManual.ForeColor = Color.White;
            this.btnSwitchToFaceManual.FlatStyle = FlatStyle.Flat;
            this.btnSwitchToFaceManual.Size = new Size(320, 46);
            this.btnSwitchToFaceManual.Cursor = Cursors.Hand;
            this.btnSwitchToFaceManual.Anchor = AnchorStyles.None;
            this.btnSwitchToFaceManual.FlatAppearance.BorderSize = 0;
            this.btnSwitchToFaceManual.Click += (s, e) => {
                ShowView("face-attendance");
                viewFaceAttendance.SetBackupMode(false);
            };

            this.tblAttendanceLeft.Controls.Add(this.lblActiveBranch, 0, 0);
            this.tblAttendanceLeft.Controls.Add(this.pnlScannerStatus, 0, 1);
            this.tblAttendanceLeft.Controls.Add(this.lblLiveDateTime, 0, 2);
            this.tblAttendanceLeft.Controls.Add(this.picAttendanceFinger, 0, 3);
            this.tblAttendanceLeft.Controls.Add(this.lblReadyToScan, 0, 4);
            this.tblAttendanceLeft.Controls.Add(this.btnSwitchToFaceManual, 0, 5);

            // RIGHT PANEL - plain Panel so Dock=Fill works on children
            this.pnlAttendanceRightContent = new System.Windows.Forms.Panel();
            this.pnlAttendanceRightContent.Dock = DockStyle.Fill;
            this.pnlAttendanceRightContent.Visible = true;
            this.pnlAttendanceRightContent.BackColor = Color.White;

            // tblAttendanceRight: the result card (photo + status + name + code + time)
            this.tblAttendanceRight = new System.Windows.Forms.TableLayoutPanel();
            this.tblAttendanceRight.Dock = DockStyle.Fill;
            this.tblAttendanceRight.ColumnCount = 1;
            this.tblAttendanceRight.RowCount = 5;
            this.tblAttendanceRight.RowStyles.Add(new RowStyle(SizeType.Percent, 32F)); // photo
            this.tblAttendanceRight.RowStyles.Add(new RowStyle(SizeType.Percent, 16F)); // status
            this.tblAttendanceRight.RowStyles.Add(new RowStyle(SizeType.Percent, 14F)); // time
            this.tblAttendanceRight.RowStyles.Add(new RowStyle(SizeType.Percent, 28F)); // name
            this.tblAttendanceRight.RowStyles.Add(new RowStyle(SizeType.Percent, 10F)); // code
            this.tblAttendanceRight.BackColor = Color.White;
            this.tblAttendanceRight.Visible = false; // hidden until scan

            this.picSuccessProfile.Dock = DockStyle.None;
            this.picSuccessProfile.Anchor = AnchorStyles.None; // center it
            this.picSuccessProfile.Size = new Size(160, 200); // portrait size like V7
            this.picSuccessProfile.BorderStyle = BorderStyle.FixedSingle;
            this.picSuccessProfile.BackColor = Color.WhiteSmoke;
            this.picSuccessProfile.SizeMode = PictureBoxSizeMode.Zoom;

            this.lblSuccessStatus.Dock = DockStyle.Fill;
            this.lblSuccessStatus.TextAlign = ContentAlignment.MiddleCenter;
            this.lblSuccessStatus.Font = new Font("Segoe UI", 26f, FontStyle.Bold);
            this.lblSuccessStatus.AutoEllipsis = false;

            this.lblSuccessName.Dock = DockStyle.Fill;
            this.lblSuccessName.TextAlign = ContentAlignment.MiddleCenter;
            this.lblSuccessName.Font = new Font("Segoe UI", 34f, FontStyle.Bold);
            this.lblSuccessName.ForeColor = Color.FromArgb(30, 30, 30);
            this.lblSuccessName.AutoEllipsis = false;

            this.lblSuccessCode.Dock = DockStyle.Fill;
            this.lblSuccessCode.TextAlign = ContentAlignment.MiddleCenter;
            this.lblSuccessCode.Font = new Font("Segoe UI", 22f, FontStyle.Bold);
            this.lblSuccessCode.ForeColor = Color.FromArgb(80, 80, 80);

            this.lblSuccessTime.Dock = DockStyle.Fill;
            this.lblSuccessTime.TextAlign = ContentAlignment.MiddleCenter;
            this.lblSuccessTime.Font = new Font("Segoe UI", 18f, FontStyle.Bold);
            this.lblSuccessTime.ForeColor = Color.FromArgb(100, 100, 100);

            // Placeholder (shown when no scan yet)
            this.lblWaitPlaceholder.Dock = DockStyle.Fill;
            this.lblWaitPlaceholder.TextAlign = ContentAlignment.MiddleCenter;
            this.lblWaitPlaceholder.Font = new Font("Segoe UI", 20f, FontStyle.Italic);
            this.lblWaitPlaceholder.ForeColor = Color.LightGray;
            this.lblWaitPlaceholder.Text = "Employee Details Will Appear Here";
            this.lblWaitPlaceholder.Visible = true;

            // Build result card: photo, status, time, name, code
            this.tblAttendanceRight.Controls.Add(this.picSuccessProfile, 0, 0);
            this.tblAttendanceRight.Controls.Add(this.lblSuccessStatus, 0, 1);
            this.tblAttendanceRight.Controls.Add(this.lblSuccessTime, 0, 2);
            this.tblAttendanceRight.Controls.Add(this.lblSuccessName, 0, 3);
            this.tblAttendanceRight.Controls.Add(this.lblSuccessCode, 0, 4);

            // Wrapper: placeholder + result card
            this.pnlAttendanceRightContent.Controls.Add(this.tblAttendanceRight);
            this.pnlAttendanceRightContent.Controls.Add(this.lblWaitPlaceholder);

            this.tblAttendanceMain.Controls.Add(this.tblAttendanceLeft, 0, 0);
            this.tblAttendanceMain.Controls.Add(this.pnlAttendanceRightContent, 1, 0);
            this.viewAttendance.Controls.Add(this.tblAttendanceMain);


            // -- Registration View --

            this.viewRegister.Dock = System.Windows.Forms.DockStyle.Fill;
            this.viewRegister.Visible = false;
            this.lblRegInstructor.Text = "Step 1: Choose Branch and Employee";
            this.lblRegInstructor.Location = new System.Drawing.Point(40, 30);
            this.lblRegInstructor.Font = new System.Drawing.Font("Segoe UI", 13, System.Drawing.FontStyle.Bold);
            this.lblRegInstructor.AutoSize = true;

            // Branch selector
            this.lblRegBranch.Text = "Branch:";
            this.lblRegBranch.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Bold);
            this.lblRegBranch.ForeColor = System.Drawing.Color.FromArgb(70, 70, 70);
            this.lblRegBranch.Location = new System.Drawing.Point(40, 72);
            this.lblRegBranch.AutoSize = true;

            this.cmbRegBranches.Location = new System.Drawing.Point(40, 94);
            this.cmbRegBranches.Width = 170;
            this.cmbRegBranches.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
            this.cmbRegBranches.Font = new System.Drawing.Font("Segoe UI", 9.5F);

            // Search Box (Instant Live Filter by Name or Code)
            this.lblRegSearch.Text = "🔍 Search Employee (Name / Code):";
            this.lblRegSearch.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Bold);
            this.lblRegSearch.ForeColor = System.Drawing.Color.FromArgb(70, 70, 70);
            this.lblRegSearch.Location = new System.Drawing.Point(230, 72);
            this.lblRegSearch.AutoSize = true;

            this.txtRegSearch.Location = new System.Drawing.Point(230, 94);
            this.txtRegSearch.Width = 230;
            this.txtRegSearch.Font = new System.Drawing.Font("Segoe UI", 9.5F);
            this.txtRegSearch.PlaceholderText = "Type name or code (e.g. bilal)...";

            this.btnRegClearSearch.Text = "✕ Clear";
            this.btnRegClearSearch.Location = new System.Drawing.Point(465, 93);
            this.btnRegClearSearch.Size = new System.Drawing.Size(65, 27);
            this.btnRegClearSearch.Font = new System.Drawing.Font("Segoe UI", 8.5F);
            this.btnRegClearSearch.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.btnRegClearSearch.BackColor = System.Drawing.Color.FromArgb(240, 240, 240);
            this.btnRegClearSearch.Cursor = System.Windows.Forms.Cursors.Hand;

            // Employee dropdown
            this.lblRegEmployee.Text = "Select Employee:";
            this.lblRegEmployee.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Bold);
            this.lblRegEmployee.ForeColor = System.Drawing.Color.FromArgb(70, 70, 70);
            this.lblRegEmployee.Location = new System.Drawing.Point(545, 72);
            this.lblRegEmployee.AutoSize = true;

            this.cmbRegEmployees.Location = new System.Drawing.Point(545, 94);
            this.cmbRegEmployees.Width = 330;
            this.cmbRegEmployees.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
            this.cmbRegEmployees.Font = new System.Drawing.Font("Segoe UI", 9.5F);

            // Open enrollment button
            this.btnOpenEnrollment.Text = "OPEN 4-SCAN REGISTRATION POPUP";
            this.btnOpenEnrollment.BackColor = System.Drawing.Color.FromArgb(13, 202, 240);
            this.btnOpenEnrollment.Location = new System.Drawing.Point(40, 155);
            this.btnOpenEnrollment.Size = new System.Drawing.Size(350, 55);
            this.btnOpenEnrollment.Font = new System.Drawing.Font("Segoe UI", 10F, System.Drawing.FontStyle.Bold);
            this.btnOpenEnrollment.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.btnOpenEnrollment.ForeColor = System.Drawing.Color.White;
            this.btnOpenEnrollment.Cursor = System.Windows.Forms.Cursors.Hand;
            this.btnOpenEnrollment.Click += new System.EventHandler(this.btnOpenEnrollment_Click);

            // Status label
            this.lblRegStatus.AutoSize = true;
            this.lblRegStatus.MaximumSize = new System.Drawing.Size(700, 0);
            this.lblRegStatus.Text = "Ready to start new enrollment.";
            this.lblRegStatus.Location = new System.Drawing.Point(40, 230);
            this.lblRegStatus.Font = new System.Drawing.Font("Segoe UI", 10F);

            this.viewRegister.Controls.AddRange(new System.Windows.Forms.Control[] { 
                this.lblRegInstructor, 
                this.lblRegBranch,
                this.cmbRegBranches, 
                this.lblRegSearch,
                this.txtRegSearch,
                this.btnRegClearSearch,
                this.lblRegEmployee,
                this.cmbRegEmployees, 
                this.btnOpenEnrollment, 
                this.lblRegStatus 
            });

            this.pnlContent.Controls.AddRange(new System.Windows.Forms.Control[] { 
                this.pnlLogin, 
                this.viewAttendance, 
                this.viewRegister,
                this.viewFaceAttendance,
                this.viewFaceRegister,
                this.viewFaceDiagnostic
            });

            this.resetTimer.Interval = 2000;
            this.resetTimer.Tick += (s, e) => ResetAttendanceUI();

            this.timerLiveClock.Interval = 1000;
            this.timerLiveClock.Tick += (s, e) => this.UpdateLiveClock(s, e);
            this.timerLiveClock.Start();

            this.ClientSize = new System.Drawing.Size(1200, 800);
            this.Controls.Add(this.pnlContent);
            this.Controls.Add(this.pnlSidebar);
            this.Text = "BAS Professional Biometric Bridge";
            this.WindowState = System.Windows.Forms.FormWindowState.Maximized;
            this.Resize += (s, e) => CenterControls();
            CenterControls();
        }

        private void CenterControls()
        {
            // Responsive Login Panel Scaling
            float loginScale = Math.Min(1.0f, Math.Min(pnlContent.Width / 900f, pnlContent.Height / 600f));
            pnlLogin.Width = (int)(850 * loginScale);
            pnlLogin.Height = (int)(500 * loginScale);
            pnlLogin.Left = (pnlContent.Width - pnlLogin.Width) / 2;
            pnlLogin.Top = (pnlContent.Height - pnlLogin.Height) / 2;

            if (viewAttendance.Visible)
            {
                // Layout is handled by TableLayoutPanel (Dock=Fill) - no manual sizing needed
                lblActiveBranch.BackColor = Color.FromArgb(240, 240, 240);
            }

            if (viewRegister.Visible)
            {
                // Simple centering for registration view
                int regWidth = 600;
                int regLeft = (pnlContent.Width - regWidth) / 2;
                lblRegInstructor.Left = regLeft;
                cmbRegBranches.Left = regLeft;
                cmbRegEmployees.Left = regLeft + 220;
                btnOpenEnrollment.Left = regLeft;
                lblRegStatus.Left = regLeft;
            }
        }

        private System.Windows.Forms.Panel pnlSidebar;
        private System.Windows.Forms.Panel pnlContent;
        private System.Windows.Forms.Label lblAppTitle;
        private System.Windows.Forms.Button btnNavAttendance;
        private System.Windows.Forms.Button btnNavRegister;
        private System.Windows.Forms.Button btnNavFaceAttendance;
        private System.Windows.Forms.Button btnNavFaceRegister;
        public System.Windows.Forms.Button btnNavFaceDiagnostic;
        public FaceAttendanceView viewFaceAttendance;
        public FaceRegisterView viewFaceRegister;
        public FaceDiagnosticView viewFaceDiagnostic;
        private System.Windows.Forms.Button btnLogout;
        private System.Windows.Forms.Label lblActiveBranch;
        private System.Windows.Forms.Panel pnlLogin;
        private System.Windows.Forms.Panel pnlLoginLeft;
        private System.Windows.Forms.Panel pnlLoginRight;
        private System.Windows.Forms.Label lblLoginLeftLogo;
        private System.Windows.Forms.Label lblLoginLeftTitle;
        private System.Windows.Forms.Label lblLoginLeftDesc;
        private System.Windows.Forms.Label lblLoginTitle;
        private System.Windows.Forms.Label lblLoginSubtitle;
        private System.Windows.Forms.Label lblEmailLabel;
        private System.Windows.Forms.TextBox txtEmail;
        private System.Windows.Forms.Label lblPasswordLabel;
        private System.Windows.Forms.TextBox txtPassword;
        private System.Windows.Forms.CheckBox chkRememberMe;
        private System.Windows.Forms.Label lblForgotPassword;
        private System.Windows.Forms.Button btnLogin;
        private System.Windows.Forms.Label lblLoginFooter;
        private System.Windows.Forms.Panel viewAttendance;
        private System.Windows.Forms.Panel viewRegister;
        private System.Windows.Forms.Label lblScannerStatus;
        private System.Windows.Forms.Label lblReadyToScan;
        private System.Windows.Forms.PictureBox picAttendanceFinger;
        private System.Windows.Forms.PictureBox picSuccessProfile;
        private System.Windows.Forms.Label lblscanInstruction;
        private System.Windows.Forms.ComboBox cmbRegEmployees;
        private System.Windows.Forms.ComboBox cmbRegBranches;
        private System.Windows.Forms.Button btnOpenEnrollment;
        private System.Windows.Forms.Label lblRegStatus;
        private System.Windows.Forms.Label lblRegInstructor;
        private System.Windows.Forms.Label lblRegBranch;
        private System.Windows.Forms.Label lblRegSearch;
        public System.Windows.Forms.TextBox txtRegSearch;
        private System.Windows.Forms.Button btnRegClearSearch;
        private System.Windows.Forms.Label lblRegEmployee;
        private System.Windows.Forms.Label lblSuccessName;
        private System.Windows.Forms.Label lblSuccessCode;
        private System.Windows.Forms.Label lblSuccessStatus;
        private System.Windows.Forms.Label lblSuccessTime;
        private System.Windows.Forms.Timer resetTimer;
        private System.Windows.Forms.Panel pnlScannerStatus;
        private System.Windows.Forms.TableLayoutPanel tblAttendanceMain;
        private System.Windows.Forms.TableLayoutPanel tblAttendanceLeft;
        private System.Windows.Forms.Panel pnlAttendanceRightContent;
        private System.Windows.Forms.TableLayoutPanel tblAttendanceRight;
        private System.Windows.Forms.Label lblWaitPlaceholder;
        private System.Windows.Forms.Label lblLiveDateTime;
        private System.Windows.Forms.Timer timerLiveClock;
        private System.Windows.Forms.ComboBox cmbAttendanceBranch;
        private System.Windows.Forms.Label lblBranchLabel;
        private System.Windows.Forms.FlowLayoutPanel pnlManualTest;
        private System.Windows.Forms.Label lblManualLabel;
        private System.Windows.Forms.TextBox txtManualCode;
        private System.Windows.Forms.Button btnManualCheck;
        private System.Windows.Forms.Button btnSwitchToFaceManual;
    }
}
