using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using RestSharp;
using Newtonsoft.Json;
using ZXing;
using ZXing.Common;
using ZXing.Rendering;

namespace BarcodePrintingApp
{
    public partial class MainForm : Form
    {
        private Config _config;
        private RestClient _client;
        private string? _token;
        private UserData? _user;
        private List<WHItem> _allItems = new();
        private List<BarcodePrintItem> _printList = new();

        public MainForm(string? token, UserData? user)
        {
            InitializeComponent();
            _token = token;
            _user = user;
            _config = Config.Load();
            string cleanServer = (_config.ServerUrl ?? "").Trim();
            if (!cleanServer.StartsWith("http://", StringComparison.OrdinalIgnoreCase) && 
                !cleanServer.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            {
                cleanServer = "https://" + cleanServer;
            }
            _client = new RestClient(cleanServer);

            this.Text = "BW-SOFTWARE AGENCY - Barcode & Label Thermal Printing System";
            this.Size = new Size(1180, 780);
            this.MinimumSize = new Size(1000, 680);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = Color.FromArgb(235, 235, 225);
            this.KeyPreview = true;

            SetupUI();
            LoadPrinters(false);
            UpdatePreview();
            RegisterShortcuts();
        }

        protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
        {
            if (keyData == (Keys.Control | Keys.P) || keyData == Keys.F5)
            {
                PrintReport(false);
                return true;
            }
            if (keyData == Keys.F2)
            {
                OpenItemSearch();
                return true;
            }
            return base.ProcessCmdKey(ref msg, keyData);
        }

        private void RegisterShortcuts()
        {
            this.KeyDown += (s, e) => {
                if (e.KeyCode == Keys.Delete)
                {
                    var grid = (DataGridView?)this.Controls.Find("dgvPrint", true).FirstOrDefault();
                    if (grid != null && grid.Focused)
                    {
                        RemoveSelectedFromQueue();
                        e.Handled = true;
                    }
                }
            };
        }

        private void SetupUI()
        {
            this.Controls.Clear();
            this.BackColor = Color.FromArgb(235, 235, 225);

            // --- TOP HEADER ---
            var pnlHead = new Panel
            {
                Dock = DockStyle.Top,
                Height = 44,
                BackColor = Color.FromArgb(43, 88, 118)
            };

            var lblAppTitle = new Label
            {
                Text = "🏷️ BW-SOFTWARE AGENCY - Barcode Label & Thermal Printing System",
                ForeColor = Color.White,
                Font = new Font("Segoe UI Semibold", 11.5F, FontStyle.Bold),
                Location = new Point(15, 10),
                AutoSize = true
            };

            var lblUser = new Label
            {
                Text = _user != null ? $"User: {_user.name} ({_user.role})" : "User: Administrator",
                ForeColor = Color.FromArgb(220, 235, 252),
                Font = new Font("Segoe UI", 9.5F),
                Anchor = AnchorStyles.Top | AnchorStyles.Right,
                Location = new Point(880, 12),
                AutoSize = true
            };

            pnlHead.Controls.Add(lblAppTitle);
            pnlHead.Controls.Add(lblUser);
            this.Controls.Add(pnlHead);

            // --- BOTTOM FOOTER ---
            var pnlFooter = new Panel
            {
                Dock = DockStyle.Bottom,
                Height = 32,
                BackColor = Color.FromArgb(43, 88, 118)
            };

            var lblFooterDev = new Label
            {
                Text = "SOFTWARE DEVELOPED BY BW-SOFTWARE AGENCY   |   CONTACT: +923192173398",
                ForeColor = Color.White,
                Font = new Font("Segoe UI Semibold", 9.5F, FontStyle.Bold),
                Dock = DockStyle.Fill,
                TextAlign = ContentAlignment.MiddleCenter
            };
            pnlFooter.Controls.Add(lblFooterDev);
            this.Controls.Add(pnlFooter);

            // --- TABS (Main Content Area) ---
            var tabs = new TabControl
            {
                Dock = DockStyle.Fill,
                Padding = new Point(15, 6),
                Font = new Font("Segoe UI Semibold", 10F),
                Name = "mainTabs"
            };
            this.Controls.Add(tabs);

            pnlHead.BringToFront();
            pnlFooter.BringToFront();
            tabs.SendToBack();

            var tabDetail = new TabPage { Text = "     Detail & Printing     ", BackColor = Color.FromArgb(235, 235, 225) };
            var tabList = new TabPage { Text = "     Browse Catalog & Invoices     ", BackColor = Color.FromArgb(235, 235, 225) };

            tabs.TabPages.Add(tabDetail);
            tabs.TabPages.Add(tabList);

            // =========================================================================
            // TAB 1: DETAIL & PRINTING (Split 42% Controls / 58% Print Queue)
            // =========================================================================
            var detailLayout = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2 };
            detailLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 450));
            detailLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

            // LEFT PANEL: Controls & Settings
            var pnlLeft = new Panel { Dock = DockStyle.Fill, AutoScroll = true, Padding = new Padding(8) };

            // 1. Search Buttons
            var btnOpenSearch = new Button
            {
                Text = "🔍 SEARCH ITEM BY NAME / CODE  [F2]",
                Location = new Point(8, 8),
                Width = 416,
                Height = 38,
                BackColor = Color.FromArgb(43, 88, 118),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI Bold", 9.5F),
                Cursor = Cursors.Hand
            };
            btnOpenSearch.Click += (s, e) => OpenItemSearch();

            var btnOpenPurchases = new Button
            {
                Text = "📄 LOAD FROM PURCHASE INVOICE",
                Location = new Point(8, 50),
                Width = 416,
                Height = 34,
                BackColor = Color.FromArgb(108, 117, 125),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI Bold", 9F),
                Cursor = Cursors.Hand
            };
            btnOpenPurchases.Click += (s, e) => OpenPurchaseSearch();

            // 2. Quick Manual Entry GroupBox
            var gbManual = new GroupBox
            {
                Text = "⚡ Quick Barcode / Item Code Scanner",
                Width = 416,
                Height = 78,
                Location = new Point(8, 90),
                Font = new Font("Segoe UI", 9F, FontStyle.Bold)
            };
            var lblMBc = new Label { Text = "Barcode / Code:", Location = new Point(10, 22), AutoSize = true, Font = new Font("Segoe UI", 8.5F) };
            var txtManualBc = new TextBox { Name = "txtManualBc", Width = 180, Location = new Point(10, 42), Font = new Font("Segoe UI", 10F) };
            var lblMQty = new Label { Text = "Qty:", Location = new Point(200, 22), AutoSize = true, Font = new Font("Segoe UI", 8.5F) };
            var txtManualQty = new TextBox { Name = "txtManualQty", Width = 55, Location = new Point(200, 42), Text = "1", Font = new Font("Segoe UI", 10F) };
            var btnManualAdd = new Button
            {
                Text = "➕ ADD",
                Location = new Point(265, 40),
                Width = 140,
                Height = 28,
                BackColor = Color.FromArgb(25, 135, 84),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI Bold", 9F),
                Cursor = Cursors.Hand
            };
            btnManualAdd.Click += async (s, e) => await AddManualBarcode(txtManualBc.Text, txtManualQty.Text);
            txtManualBc.KeyDown += async (s, e) => { if (e.KeyCode == Keys.Enter) await AddManualBarcode(txtManualBc.Text, txtManualQty.Text); };
            txtManualQty.KeyDown += async (s, e) => { if (e.KeyCode == Keys.Enter) await AddManualBarcode(txtManualBc.Text, txtManualQty.Text); };
            gbManual.Controls.AddRange(new Control[] { lblMBc, txtManualBc, lblMQty, txtManualQty, btnManualAdd });

            // 3. Printer & Label Configuration GroupBox
            var gbPrinter = new GroupBox
            {
                Text = "🖨️ Printer & Tag Size Configuration",
                Width = 416,
                Height = 210,
                Location = new Point(8, 174),
                Font = new Font("Segoe UI", 9F, FontStyle.Bold)
            };

            var lblPrinter = new Label { Text = "Target Printer (Local / Network / Thermal):", Location = new Point(10, 20), AutoSize = true, Font = new Font("Segoe UI", 8.5F) };
            var cmbPrinters = new ComboBox
            {
                Name = "cmbPrinters",
                Width = 285,
                Location = new Point(10, 40),
                DropDownStyle = ComboBoxStyle.DropDownList,
                Font = new Font("Segoe UI", 9.5F)
            };
            cmbPrinters.SelectedIndexChanged += (s, e) => {
                string sel = cmbPrinters.SelectedItem?.ToString() ?? "";
                if (!string.IsNullOrEmpty(sel))
                {
                    _config.SelectedPrinter = sel;
                    Config.Save(_config);
                    UpdatePrinterStatusLabel(sel);
                }
            };

            var btnSyncPrinters = new Button
            {
                Name = "btnSyncPrinters",
                Text = "🔄 Sync",
                Location = new Point(302, 38),
                Width = 104,
                Height = 28,
                BackColor = Color.FromArgb(43, 88, 118),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI Bold", 9F),
                Cursor = Cursors.Hand
            };
            btnSyncPrinters.Click += (s, e) => LoadPrinters(true);

            var lblPrinterStatus = new Label
            {
                Name = "lblPrinterStatus",
                Text = "● Checking printers...",
                Location = new Point(10, 70),
                Size = new Size(396, 18),
                ForeColor = Color.FromArgb(43, 88, 118),
                Font = new Font("Segoe UI Semibold", 8.5F)
            };

            var lblLabelSize = new Label { Text = "Tag Preset:", Location = new Point(10, 92), AutoSize = true, Font = new Font("Segoe UI", 8.5F) };
            var cmbLabelSize = new ComboBox
            {
                Name = "cmbLabelSize",
                Width = 215,
                Location = new Point(10, 110),
                DropDownStyle = ComboBoxStyle.DropDownList,
                Font = new Font("Segoe UI", 9F)
            };
            cmbLabelSize.Items.AddRange(new object[] {
                "38mm x 25mm (1.5\" x 1.0\") - Standard Tag (Matches Photo)",
                "38mm x 28mm (1.5\" x 1.1\") - Pharmacy Tag",
                "38mm x 20mm (1.5\" x 0.8\") - Compact Tag",
                "40mm x 25mm - Medium Tag",
                "50mm x 25mm (2.0\" x 1.0\") - Wide Retail"
            });
            int labelIdx = cmbLabelSize.Items.IndexOf(_config.SelectedLabelSize);
            cmbLabelSize.SelectedIndex = labelIdx >= 0 ? labelIdx : 0;

            var lblCompany = new Label { Text = "Store Header:", Location = new Point(235, 92), AutoSize = true, Font = new Font("Segoe UI", 8.5F) };
            var txtCompany = new TextBox
            {
                Name = "txtCompany",
                Width = 171,
                Location = new Point(235, 110),
                Text = string.IsNullOrEmpty(_config.CompanyHeader) ? "D Watson Pharmacy & Super Sto" : _config.CompanyHeader,
                Font = new Font("Segoe UI", 9F)
            };
            txtCompany.TextChanged += (s, e) => {
                _config.CompanyHeader = txtCompany.Text.Trim();
                Config.Save(_config);
                UpdatePreview();
            };

            // Row 4: Exact Dimensions & Alignment (Width, Height, Offset, Active Invoice)
            var lblW = new Label { Text = "W(mm):", Location = new Point(10, 142), AutoSize = true, Font = new Font("Segoe UI", 8F) };
            var numWidth = new NumericUpDown { Name = "numWidth", Location = new Point(10, 160), Width = 62, Minimum = 20, Maximum = 120, Value = _config.LabelWidthMm, Font = new Font("Segoe UI", 9F) };

            var lblH = new Label { Text = "H(mm):", Location = new Point(82, 142), AutoSize = true, Font = new Font("Segoe UI", 8F) };
            var numHeight = new NumericUpDown { Name = "numHeight", Location = new Point(82, 160), Width = 62, Minimum = 15, Maximum = 100, Value = _config.LabelHeightMm, Font = new Font("Segoe UI", 9F) };

            var lblOffset = new Label { Text = "Offset(mm):", Location = new Point(154, 142), AutoSize = true, Font = new Font("Segoe UI", 8F) };
            var numOffset = new NumericUpDown { Name = "numOffset", Location = new Point(154, 160), Width = 65, Minimum = -15, Maximum = 25, Value = _config.TopOffsetMm, Font = new Font("Segoe UI", 9F) };

            var lblInv = new Label { Text = "Active Invoice:", Location = new Point(235, 142), AutoSize = true, Font = new Font("Segoe UI", 8F) };
            var txtInv = new TextBox { Name = "txtInv", Width = 171, Location = new Point(235, 159), ReadOnly = true, BackColor = Color.WhiteSmoke, Font = new Font("Segoe UI", 9F) };

            cmbLabelSize.SelectedIndexChanged += (s, e) => {
                string sel = cmbLabelSize.SelectedItem?.ToString() ?? "";
                _config.SelectedLabelSize = sel;
                if (sel.Contains("38mm x 25mm")) { numWidth.Value = 38; numHeight.Value = 25; }
                else if (sel.Contains("38mm x 28mm")) { numWidth.Value = 38; numHeight.Value = 28; }
                else if (sel.Contains("38mm x 20mm")) { numWidth.Value = 38; numHeight.Value = 20; }
                else if (sel.Contains("40mm x 25mm")) { numWidth.Value = 40; numHeight.Value = 25; }
                else if (sel.Contains("50mm x 25mm")) { numWidth.Value = 50; numHeight.Value = 25; }
                Config.Save(_config);
                UpdatePreview();
            };

            numWidth.ValueChanged += (s, e) => {
                _config.LabelWidthMm = (int)numWidth.Value;
                Config.Save(_config);
                UpdatePreview();
            };

            numHeight.ValueChanged += (s, e) => {
                _config.LabelHeightMm = (int)numHeight.Value;
                Config.Save(_config);
                UpdatePreview();
            };

            numOffset.ValueChanged += (s, e) => {
                _config.TopOffsetMm = (int)numOffset.Value;
                Config.Save(_config);
                UpdatePreview();
            };

            gbPrinter.Controls.AddRange(new Control[] {
                lblPrinter, cmbPrinters, btnSyncPrinters, lblPrinterStatus,
                lblLabelSize, cmbLabelSize, lblCompany, txtCompany,
                lblW, numWidth, lblH, numHeight, lblOffset, numOffset,
                lblInv, txtInv
            });

            // 4. Live Label Preview GroupBox
            var gbPreview = new GroupBox
            {
                Text = "👁️ Live Barcode Label Preview (WYSIWYG)",
                Width = 416,
                Height = 175,
                Location = new Point(8, 395),
                Font = new Font("Segoe UI", 9F, FontStyle.Bold)
            };

            var picPreview = new PictureBox
            {
                Name = "picPreview",
                Location = new Point(95, 20),
                Size = new Size(225, 145),
                BorderStyle = BorderStyle.FixedSingle,
                BackColor = Color.White,
                SizeMode = PictureBoxSizeMode.CenterImage
            };
            gbPreview.Controls.Add(picPreview);

            // 5. Action Buttons (Test Print & Print All)
            var btnTestPrint = new Button
            {
                Name = "btnTestPrint",
                Text = "🖨️ TEST PRINT (1 LABEL)",
                Location = new Point(8, 578),
                Width = 195,
                Height = 44,
                BackColor = Color.FromArgb(108, 117, 125),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI Bold", 9.5F),
                Cursor = Cursors.Hand
            };
            btnTestPrint.Click += (s, e) => PrintReport(true);

            var btnPrint = new Button
            {
                Name = "btnPrint",
                Text = "🖨️ PRINT ALL BARCODES  [Ctrl+P]",
                Location = new Point(210, 578),
                Width = 214,
                Height = 44,
                BackColor = Color.FromArgb(43, 88, 118),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI Bold", 10F),
                Cursor = Cursors.Hand
            };
            btnPrint.Click += (s, e) => PrintReport(false);

            pnlLeft.Controls.AddRange(new Control[] {
                btnOpenSearch, btnOpenPurchases, gbManual, gbPrinter, gbPreview, btnTestPrint, btnPrint
            });

            // RIGHT PANEL: Print Queue Grid
            var pnlRight = new Panel { Dock = DockStyle.Fill, Padding = new Padding(8) };

            var pnlQueueHeader = new Panel
            {
                Dock = DockStyle.Top,
                Height = 40,
                BackColor = Color.FromArgb(220, 225, 230),
                Padding = new Padding(6)
            };

            var lblQueueTitle = new Label
            {
                Text = "PRINT QUEUE",
                Font = new Font("Segoe UI Bold", 10F),
                ForeColor = Color.FromArgb(43, 88, 118),
                Location = new Point(8, 10),
                AutoSize = true
            };

            var lblQueueCount = new Label
            {
                Name = "lblQueueCount",
                Text = "Total Items: 0   |   Total Labels to Print: 0",
                Font = new Font("Segoe UI Semibold", 9.5F),
                ForeColor = Color.FromArgb(30, 40, 50),
                Location = new Point(130, 11),
                AutoSize = true
            };

            var btnRemoveSelected = new Button
            {
                Text = "❌ Remove",
                Anchor = AnchorStyles.Top | AnchorStyles.Right,
                Location = new Point(410, 6),
                Width = 100,
                Height = 28,
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(220, 53, 69),
                ForeColor = Color.White,
                Font = new Font("Segoe UI Bold", 8.5F),
                Cursor = Cursors.Hand
            };
            btnRemoveSelected.Click += (s, e) => RemoveSelectedFromQueue();

            var btnClear = new Button
            {
                Text = "🗑️ Clear All",
                Anchor = AnchorStyles.Top | AnchorStyles.Right,
                Location = new Point(516, 6),
                Width = 95,
                Height = 28,
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(108, 117, 125),
                ForeColor = Color.White,
                Font = new Font("Segoe UI", 8.5F),
                Cursor = Cursors.Hand
            };
            btnClear.Click += (s, e) => {
                if (_printList.Count > 0 && MessageBox.Show("Clear all items from the print queue?", "Confirm Clear", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes)
                {
                    _printList.Clear();
                    RefreshPrintGrid();
                }
            };

            pnlQueueHeader.Controls.AddRange(new Control[] { lblQueueTitle, lblQueueCount, btnRemoveSelected, btnClear });

            var dgvPrint = new DataGridView
            {
                Name = "dgvPrint",
                Dock = DockStyle.Fill,
                AllowUserToAddRows = false,
                BackgroundColor = Color.White,
                BorderStyle = BorderStyle.Fixed3D,
                AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
                SelectionMode = DataGridViewSelectionMode.FullRowSelect,
                MultiSelect = true,
                EditMode = DataGridViewEditMode.EditOnEnter,
                RowTemplate = { Height = 28 },
                Font = new Font("Segoe UI", 9.5F)
            };

            dgvPrint.CellEndEdit += (s, e) => {
                if (e.ColumnIndex >= 0 && dgvPrint.Columns[e.ColumnIndex].DataPropertyName == "Qty")
                {
                    var val = dgvPrint.Rows[e.RowIndex].Cells[e.ColumnIndex].Value?.ToString();
                    if (int.TryParse(val, out int q) && q >= 0)
                    {
                        if (e.RowIndex < _printList.Count) _printList[e.RowIndex].Qty = q;
                    }
                    UpdateQueueSummary();
                }
            };

            dgvPrint.SelectionChanged += (s, e) => UpdatePreview();

            pnlRight.Controls.Add(dgvPrint);
            pnlRight.Controls.Add(pnlQueueHeader);

            detailLayout.Controls.Add(pnlLeft, 0, 0);
            detailLayout.Controls.Add(pnlRight, 1, 0);
            tabDetail.Controls.Add(detailLayout);

            // =========================================================================
            // TAB 2: LIST / SEARCH (Catalog & Invoices)
            // =========================================================================
            var listLayout = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 2 };
            listLayout.RowStyles.Add(new RowStyle(SizeType.Percent, 40));
            listLayout.RowStyles.Add(new RowStyle(SizeType.Percent, 60));

            // Top: Invoices
            var pnlInvSearch = new Panel { Dock = DockStyle.Fill, Padding = new Padding(10) };
            var lblIS = new Label { Text = "SEARCH PURCHASES:", Font = new Font("Segoe UI", 9F, FontStyle.Bold), Location = new Point(10, 10), AutoSize = true };
            var txtISear = new TextBox { Name = "txtISear", Width = 220, Location = new Point(10, 35), Font = new Font("Segoe UI", 9.5F) };
            var btnISear = new Button { Text = "GET INVOICES", Location = new Point(240, 33), Width = 120, Height = 28, BackColor = Color.FromArgb(43, 88, 118), ForeColor = Color.White, FlatStyle = FlatStyle.Flat };
            var dgvInvoices = new DataGridView
            {
                Name = "dgvInvoices",
                Location = new Point(10, 70),
                Width = 1000,
                Height = 180,
                AllowUserToAddRows = false,
                ReadOnly = true,
                SelectionMode = DataGridViewSelectionMode.FullRowSelect,
                BackgroundColor = Color.White,
                AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
                Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right | AnchorStyles.Bottom
            };
            btnISear.Click += async (s, e) => await FetchInvoices(txtISear.Text);
            txtISear.KeyDown += async (s, e) => { if (e.KeyCode == Keys.Enter) await FetchInvoices(txtISear.Text); };
            dgvInvoices.DoubleClick += async (s, e) => {
                if (dgvInvoices.SelectedRows.Count > 0)
                {
                    var id = dgvInvoices.SelectedRows[0].Cells["_id"].Value?.ToString();
                    if (!string.IsNullOrEmpty(id)) await FetchPurchaseItems(id);
                    tabs.SelectedTab = tabDetail;
                }
            };
            pnlInvSearch.Controls.AddRange(new Control[] { lblIS, txtISear, btnISear, dgvInvoices });

            // Bottom: Items
            var pnlItemSearch = new Panel { Dock = DockStyle.Fill, Padding = new Padding(10) };
            var lblItemS = new Label { Text = "FIND PRODUCT CATALOG / BARCODE:", Font = new Font("Segoe UI", 9F, FontStyle.Bold), Location = new Point(10, 10), AutoSize = true };
            var txtSearch = new TextBox { Name = "txtSearch", Width = 220, Location = new Point(10, 35), Font = new Font("Segoe UI", 9.5F) };
            var btnFetch = new Button { Text = "SEARCH ITEMS", Location = new Point(240, 33), Width = 120, Height = 28, BackColor = Color.FromArgb(43, 88, 118), ForeColor = Color.White, FlatStyle = FlatStyle.Flat };
            var dgvItems = new DataGridView
            {
                Name = "dgvItems",
                Location = new Point(10, 70),
                Width = 1000,
                Height = 280,
                AllowUserToAddRows = false,
                ReadOnly = true,
                SelectionMode = DataGridViewSelectionMode.FullRowSelect,
                BackgroundColor = Color.White,
                AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
                Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right | AnchorStyles.Bottom
            };
            btnFetch.Click += async (s, e) => await FetchItems(txtSearch.Text);
            txtSearch.KeyDown += async (s, e) => { if (e.KeyCode == Keys.Enter) await FetchItems(txtSearch.Text); };
            dgvItems.DoubleClick += (s, e) => {
                AddToPrintList(dgvItems.SelectedRows);
                tabs.SelectedTab = tabDetail;
            };
            pnlItemSearch.Controls.AddRange(new Control[] { lblItemS, txtSearch, btnFetch, dgvItems });

            listLayout.Controls.Add(pnlInvSearch, 0, 0);
            listLayout.Controls.Add(pnlItemSearch, 0, 1);
            tabList.Controls.Add(listLayout);

            this.Controls.Add(tabs);
        }

        // =========================================================================
        // PRINTER SYNCHRONIZATION & CONFIGURATION
        // =========================================================================
        public void LoadPrinters(bool notifyUser = false)
        {
            var cmb = (ComboBox?)this.Controls.Find("cmbPrinters", true).FirstOrDefault();
            var lblStatus = (Label?)this.Controls.Find("lblPrinterStatus", true).FirstOrDefault();
            if (cmb == null) return;

            string previouslySelected = cmb.SelectedItem?.ToString() ?? _config.SelectedPrinter;
            cmb.Items.Clear();

            var installed = System.Drawing.Printing.PrinterSettings.InstalledPrinters;
            foreach (string printer in installed)
            {
                cmb.Items.Add(printer);
            }

            if (cmb.Items.Count > 0)
            {
                int idx = -1;
                if (!string.IsNullOrEmpty(previouslySelected))
                {
                    idx = cmb.Items.IndexOf(previouslySelected);
                }

                if (idx < 0)
                {
                    var defaultSettings = new System.Drawing.Printing.PrinterSettings();
                    idx = cmb.Items.IndexOf(defaultSettings.PrinterName);
                }

                cmb.SelectedIndex = idx >= 0 ? idx : 0;
                string active = cmb.SelectedItem?.ToString() ?? "";
                _config.SelectedPrinter = active;
                Config.Save(_config);

                if (lblStatus != null)
                {
                    lblStatus.Text = $"● {cmb.Items.Count} Printer(s) Synced | Active: {active}";
                    lblStatus.ForeColor = Color.FromArgb(25, 135, 84);
                }

                if (notifyUser)
                {
                    MessageBox.Show(
                        $"Printers synchronized successfully!\n\nDetected {cmb.Items.Count} printer(s):\n• " + 
                        string.Join("\n• ", installed.Cast<string>()) + 
                        $"\n\nActive Printer: {active}",
                        "Printers Synchronized", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
            }
            else
            {
                if (lblStatus != null)
                {
                    lblStatus.Text = "⚠️ No printers detected on this computer!";
                    lblStatus.ForeColor = Color.Crimson;
                }
                if (notifyUser)
                {
                    MessageBox.Show("No installed printers found. Please ensure your thermal or USB printer is plugged in and installed in Windows.", 
                        "No Printers Detected", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }
            }
        }

        private void UpdatePrinterStatusLabel(string printerName)
        {
            var lblStatus = (Label?)this.Controls.Find("lblPrinterStatus", true).FirstOrDefault();
            var cmb = (ComboBox?)this.Controls.Find("cmbPrinters", true).FirstOrDefault();
            if (lblStatus != null && cmb != null)
            {
                lblStatus.Text = $"● {cmb.Items.Count} Printer(s) Synced | Active: {printerName}";
                lblStatus.ForeColor = Color.FromArgb(25, 135, 84);
            }
        }

        // =========================================================================
        // LIVE BARCODE PREVIEW (WYSIWYG)
        // =========================================================================
        private void UpdatePreview()
        {
            var pic = (PictureBox?)this.Controls.Find("picPreview", true).FirstOrDefault();
            if (pic == null) return;

            try
            {
                var item = GetActiveOrDemoItem();
                var (width, height) = GetCurrentLabelDimensions();
                
                // Calculate scale to fit nicely within picPreview (225 x 145) with padding
                float scaleW = (pic.ClientSize.Width - 12f) / width;
                float scaleH = (pic.ClientSize.Height - 12f) / height;
                float scale = Math.Min(scaleW, scaleH);
                if (scale < 0.5f) scale = 0.5f;
                if (scale > 2.0f) scale = 2.0f;

                var bmp = GenerateLabelBitmap(item, width, height, scale, drawBorder: true);
                
                var old = pic.Image;
                pic.Image = bmp;
                old?.Dispose();
            }
            catch (Exception ex)
            {
                Console.WriteLine("Preview error: " + ex.Message);
            }
        }

        private Bitmap GenerateLabelBitmap(BarcodePrintItem item, int width, int height, float scale = 1.0f, bool drawBorder = false)
        {
            int bmpWidth = (int)(width * scale);
            int bmpHeight = (int)(height * scale);
            var bmp = new Bitmap(bmpWidth, bmpHeight);
            using (var g = Graphics.FromImage(bmp))
            {
                g.Clear(Color.White);
                if (drawBorder)
                {
                    using var pen = new Pen(Color.FromArgb(170, 180, 190), 1);
                    g.DrawRectangle(pen, 0, 0, bmpWidth - 1, bmpHeight - 1);
                }
                g.ScaleTransform(scale, scale);
                DrawLabel(g, item, width, height);
            }
            return bmp;
        }

        private BarcodePrintItem GetActiveOrDemoItem()
        {
            var grid = (DataGridView?)this.Controls.Find("dgvPrint", true).FirstOrDefault();
            if (grid != null && grid.SelectedRows.Count > 0)
            {
                int idx = grid.SelectedRows[0].Index;
                if (idx >= 0 && idx < _printList.Count) return _printList[idx];
            }
            if (_printList.Count > 0) return _printList[0];

            return new BarcodePrintItem
            {
                ItemId = "DEMO-001",
                Name = "TRIMETABOL SYP 150ML",
                Code = "143219",
                Barcode = "143219",
                CompanyName = string.IsNullOrWhiteSpace(_config.CompanyHeader) ? "D Watson Pharmacy & Super Sto" : _config.CompanyHeader,
                Price = 235.00m,
                Qty = 1
            };
        }

        private (int Width, int Height) GetCurrentLabelDimensions()
        {
            int wMm = _config.LabelWidthMm > 0 ? _config.LabelWidthMm : 38;
            int hMm = _config.LabelHeightMm > 0 ? _config.LabelHeightMm : 25;

            // 1 mm = 100 / 25.4 = 3.93701 hundredths of an inch
            int w = (int)Math.Round(wMm * 3.93701);
            int h = (int)Math.Round(hMm * 3.93701);

            if (w < 80) w = 150;
            if (h < 50) h = 100;
            return (w, h);
        }

        // =========================================================================
        // BARCODE RENDERING & LABEL GRAPHICS (FULL TAG FIT & BALANCED CENTERING)
        // =========================================================================
        private void DrawLabel(Graphics g, BarcodePrintItem item, float width = 150, float height = 100)
        {
            // Crisp, high-contrast settings for thermal dot printers
            g.InterpolationMode = InterpolationMode.NearestNeighbor;
            g.SmoothingMode = SmoothingMode.None;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;

            using Font fontCompany = new Font("Arial", 6.8f, FontStyle.Bold);
            using Font fontID = new Font("Arial", 7.5f, FontStyle.Bold);
            using Font fontName = new Font("Arial", 8.2f, FontStyle.Bold);
            using Font fontNameSmall = new Font("Arial Narrow", 7.0f, FontStyle.Bold);
            using Font fontPrice = new Font("Arial", 11.5f, FontStyle.Bold);

            // User configurable top offset in mm
            float topOffset = _config.TopOffsetMm * 3.937f;

            // 1. Company / Store Name (Top Center - Always Constant Store Header)
            string comp = !string.IsNullOrWhiteSpace(_config.CompanyHeader) ? _config.CompanyHeader : "D Watson Pharmacy & Super Sto";
            var compSize = g.MeasureString(comp, fontCompany);
            float compX = Math.Max(2f, (width - compSize.Width) / 2f);
            float compY = topOffset + Math.Max(2f, height * 0.035f);
            g.DrawString(comp, fontCompany, Brushes.Black, compX, compY);

            // 2. Barcode Graphic (Fills width nicely, leaving ~2.5mm margin each side)
            float barcodeW = Math.Min(128f, width - 20f);
            float barcodeH = Math.Min(30f, Math.Max(22f, height * 0.28f));
            float barcodeY = compY + Math.Max(10f, height * 0.12f);

            string rawCode = !string.IsNullOrWhiteSpace(item.Barcode) ? item.Barcode : item.Code;
            if (string.IsNullOrWhiteSpace(rawCode)) rawCode = "00000000";

            string cleanCode = new string(rawCode.Where(c => c >= 32 && c <= 126).ToArray());
            if (string.IsNullOrEmpty(cleanCode)) cleanCode = "00000000";

            try
            {
                var writer = new BarcodeWriterPixelData
                {
                    Format = BarcodeFormat.CODE_128,
                    Options = new EncodingOptions
                    {
                        Height = (int)barcodeH,
                        Width = (int)barcodeW,
                        Margin = 0,
                        PureBarcode = true
                    }
                };

                var pixelData = writer.Write(cleanCode);
                using var bitmap = new Bitmap(pixelData.Width, pixelData.Height, PixelFormat.Format32bppRgb);
                var bitmapData = bitmap.LockBits(
                    new Rectangle(0, 0, pixelData.Width, pixelData.Height),
                    ImageLockMode.WriteOnly,
                    PixelFormat.Format32bppRgb);
                try
                {
                    Marshal.Copy(pixelData.Pixels, 0, bitmapData.Scan0, pixelData.Pixels.Length);
                }
                finally
                {
                    bitmap.UnlockBits(bitmapData);
                }

                float barcodeX = (width - barcodeW) / 2f;
                g.DrawImage(bitmap, barcodeX, barcodeY, barcodeW, barcodeH);
            }
            catch
            {
                var errSize = g.MeasureString("BARCODE ERROR", fontID);
                g.DrawString("BARCODE ERROR", fontID, Brushes.Red, (width - errSize.Width) / 2f, barcodeY + 4f);
            }

            // 3. Human-Readable Barcode / Code Digits (Right under barcode)
            float digitsY = barcodeY + barcodeH + Math.Max(1.5f, height * 0.02f);
            string displayId = !string.IsNullOrWhiteSpace(item.Barcode) ? item.Barcode : item.Code;
            if (string.IsNullOrWhiteSpace(displayId)) displayId = "-";
            var idSize = g.MeasureString(displayId, fontID);
            float idX = Math.Max(2f, (width - idSize.Width) / 2f);
            g.DrawString(displayId, fontID, Brushes.Black, idX, digitsY);

            // 4. Item Name (Right under digits)
            float nameY = digitsY + Math.Max(10.5f, height * 0.12f);
            string name = (item.Name ?? "").Trim();
            Font activeFont = fontName;
            var nameSize = g.MeasureString(name, activeFont);
            if (nameSize.Width > width - 8f)
            {
                activeFont = fontNameSmall;
                nameSize = g.MeasureString(name, activeFont);
            }
            if (nameSize.Width > width - 6f && name.Length > 26)
            {
                name = name.Substring(0, 24) + "..";
                nameSize = g.MeasureString(name, activeFont);
            }
            float nameX = Math.Max(2f, (width - nameSize.Width) / 2f);
            g.DrawString(name, activeFont, Brushes.Black, nameX, nameY);

            // 5. Retail Price (Bold, prominent, fills bottom of tag)
            float priceY = nameY + Math.Max(12.5f, height * 0.14f);
            string pStr = "Rs: " + item.Price.ToString("N2");
            var priceSize = g.MeasureString(pStr, fontPrice);
            float priceX = Math.Max(2f, (width - priceSize.Width) / 2f);
            g.DrawString(pStr, fontPrice, Brushes.Black, priceX, priceY);
        }

        // =========================================================================
        // PRINTING EXECUTION ENGINE
        // =========================================================================
        private void PrintReport(bool isTestPrint = false)
        {
            var cmb = (ComboBox?)this.Controls.Find("cmbPrinters", true).FirstOrDefault();
            string? selectedPrinter = cmb?.SelectedItem?.ToString();

            if (string.IsNullOrWhiteSpace(selectedPrinter))
            {
                MessageBox.Show("Please select or sync a printer first.", "Printer Required", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            // Verify printer exists in installed printers list
            bool printerExists = false;
            foreach (string p in System.Drawing.Printing.PrinterSettings.InstalledPrinters)
            {
                if (string.Equals(p, selectedPrinter, StringComparison.OrdinalIgnoreCase))
                {
                    printerExists = true;
                    break;
                }
            }

            if (!printerExists)
            {
                MessageBox.Show(
                    $"Printer '{selectedPrinter}' is not recognized by Windows.\n\nPlease click 'Sync' to refresh installed printers.", 
                    "Printer Not Recognized", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            List<BarcodePrintItem> itemsToPrint;
            if (isTestPrint)
            {
                var activeItem = GetActiveOrDemoItem();
                itemsToPrint = new List<BarcodePrintItem>
                {
                    new BarcodePrintItem
                    {
                        ItemId = "TEST",
                        Name = activeItem.Name,
                        Code = activeItem.Code,
                        Barcode = activeItem.Barcode,
                        CompanyName = !string.IsNullOrWhiteSpace(_config.CompanyHeader) ? _config.CompanyHeader : "D.WATSON",
                        Price = activeItem.Price,
                        Qty = 1
                    }
                };
            }
            else
            {
                if (_printList.Count == 0)
                {
                    MessageBox.Show("Print list is empty. Please add items to print.", "Queue Empty", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }
                itemsToPrint = _printList.Where(p => p.Qty > 0).ToList();
                if (itemsToPrint.Count == 0)
                {
                    MessageBox.Show("All items in the queue have Qty = 0.", "Zero Quantity", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }
            }

            var (paperWidth, paperHeight) = GetCurrentLabelDimensions();

            var pd = new System.Drawing.Printing.PrintDocument();
            pd.PrinterSettings.PrinterName = selectedPrinter;
            pd.OriginAtMargins = false;
            pd.DefaultPageSettings.PaperSize = new System.Drawing.Printing.PaperSize("CustomLabel", paperWidth, paperHeight);
            pd.DefaultPageSettings.Margins = new System.Drawing.Printing.Margins(0, 0, 0, 0);

            int currentItemIdx = 0;
            int currentQtyDone = 0;

            pd.PrintPage += (s, ev) => {
                if (ev.Graphics == null) return;
                var item = itemsToPrint[currentItemIdx];
                DrawLabel(ev.Graphics, item, paperWidth, paperHeight);

                currentQtyDone++;
                if (currentQtyDone >= item.Qty)
                {
                    currentItemIdx++;
                    currentQtyDone = 0;
                }

                ev.HasMorePages = (currentItemIdx < itemsToPrint.Count);
            };

            try
            {
                pd.Print();
                string msg = isTestPrint 
                    ? $"Test label sent successfully to {selectedPrinter}!" 
                    : $"Printing job sent successfully!\n\nTotal labels: {itemsToPrint.Sum(p => p.Qty)}\nPrinter: {selectedPrinter}";
                MessageBox.Show(msg, "Printing Sent", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Printing Error: {ex.Message}\n\nPlease check if printer '{selectedPrinter}' is powered on and loaded with label rolls.", "Print Failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // =========================================================================
        // DATA ACCESS & QUEUE MANAGEMENT
        // =========================================================================
        private void RefreshPrintGrid()
        {
            var grid = (DataGridView?)this.Controls.Find("dgvPrint", true).FirstOrDefault();
            if (grid == null) return;

            grid.DataSource = null;

            var bindingList = new BindingList<PrintGridRow>(
                _printList.Select(p => new PrintGridRow
                {
                    Name = p.Name,
                    Barcode = p.Barcode,
                    Code = p.Code,
                    Price = p.Price,
                    Qty = p.Qty
                }).ToList()
            );

            grid.DataSource = bindingList;

            if (grid.Columns.Count >= 5)
            {
                grid.Columns[0].ReadOnly = true;  // Name
                grid.Columns[1].ReadOnly = true;  // Barcode
                grid.Columns[2].ReadOnly = true;  // Code
                grid.Columns[3].ReadOnly = true;  // Price
                grid.Columns[4].ReadOnly = false; // Qty editable
            }

            UpdateQueueSummary();
            UpdatePreview();
        }

        private void UpdateQueueSummary()
        {
            var lblCount = (Label?)this.Controls.Find("lblQueueCount", true).FirstOrDefault();
            if (lblCount != null)
            {
                int totalItems = _printList.Count;
                int totalLabels = _printList.Sum(p => p.Qty);
                lblCount.Text = $"Total Items: {totalItems}   |   Total Labels to Print: {totalLabels}";
            }
        }

        private void RemoveSelectedFromQueue()
        {
            var grid = (DataGridView?)this.Controls.Find("dgvPrint", true).FirstOrDefault();
            if (grid != null && grid.SelectedRows.Count > 0)
            {
                var indices = grid.SelectedRows.Cast<DataGridViewRow>()
                    .Select(r => r.Index)
                    .OrderByDescending(i => i)
                    .ToList();

                foreach (int idx in indices)
                {
                    if (idx >= 0 && idx < _printList.Count)
                    {
                        _printList.RemoveAt(idx);
                    }
                }
                RefreshPrintGrid();
            }
            else
            {
                MessageBox.Show("Please select an item in the queue to remove.", "Selection Required", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }

        private async Task AddManualBarcode(string barcode, string qtyStr)
        {
            if (string.IsNullOrWhiteSpace(barcode)) return;
            if (!int.TryParse(qtyStr, out int qty) || qty <= 0) qty = 1;

            barcode = barcode.Trim();

            try
            {
                var request = new RestRequest("/api/v1/wh-items", Method.Get);
                AddAuthHeaders(request);
                request.AddQueryParameter("search", barcode);

                var response = await _client.ExecuteAsync(request);
                if (response.IsSuccessful)
                {
                    var result = JsonConvert.DeserializeObject<ApiListResponse<WHItem>>(response.Content);
                    var item = result?.data.FirstOrDefault(i => i.barcode == barcode || i.itemsCode == barcode || i.name.Contains(barcode, StringComparison.OrdinalIgnoreCase));
                    if (item != null)
                    {
                        var existing = _printList.FirstOrDefault(p => p.ItemId == item._id);
                        if (existing != null)
                        {
                            existing.Qty += qty;
                        }
                        else
                        {
                            _printList.Add(new BarcodePrintItem
                            {
                                ItemId = item._id,
                                Name = item.name,
                                Code = item.itemsCode,
                                Barcode = item.barcode,
                                CompanyName = !string.IsNullOrWhiteSpace(_config.CompanyHeader) ? _config.CompanyHeader : "D Watson Pharmacy & Super Sto",
                                Price = item.retailPrice,
                                Qty = qty
                            });
                        }
                        RefreshPrintGrid();

                        var txt = (TextBox?)this.Controls.Find("txtManualBc", true).FirstOrDefault();
                        if (txt != null)
                        {
                            txt.Text = "";
                            txt.Focus();
                        }
                    }
                    else
                    {
                        MessageBox.Show($"No product found with barcode or code: {barcode}", "Item Not Found", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    }
                }
                else
                {
                    MessageBox.Show($"Server Error: {response.StatusDescription}", "Lookup Failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Lookup Error: " + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private async Task FetchItems(string search)
        {
            try
            {
                var request = new RestRequest("/api/v1/wh-items", Method.Get);
                AddAuthHeaders(request);

                if (!string.IsNullOrEmpty(search)) request.AddQueryParameter("search", search);

                var response = await _client.ExecuteAsync(request);
                if (response.IsSuccessful)
                {
                    var result = JsonConvert.DeserializeObject<ApiListResponse<WHItem>>(response.Content);
                    _allItems = result?.data ?? new();

                    var grid = (DataGridView)this.Controls.Find("dgvItems", true)[0];
                    grid.DataSource = _allItems.Select(i => new {
                        i._id,
                        Code = i.itemsCode,
                        Company = i.GetCompanyName(),
                        Name = i.name,
                        Price = i.retailPrice,
                        Barcode = i.barcode
                    }).ToList();
                    if (grid.Columns["_id"] != null) grid.Columns["_id"].Visible = false;
                }
                else
                {
                    MessageBox.Show("Error fetching items: " + response.StatusDescription);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Sync Error: " + ex.Message);
            }
        }

        private async Task FetchInvoices(string search)
        {
            try
            {
                var request = new RestRequest("/api/v1/wh-purchases", Method.Get);
                AddAuthHeaders(request);
                if (!string.IsNullOrEmpty(search)) request.AddQueryParameter("keyword", search);
                request.AddQueryParameter("limit", "20");

                var response = await _client.ExecuteAsync(request);
                if (response.IsSuccessful)
                {
                    var result = JsonConvert.DeserializeObject<ApiListResponse<WHPurchase>>(response.Content);
                    var grid = (DataGridView)this.Controls.Find("dgvInvoices", true)[0];
                    grid.DataSource = result?.data.Select(p => new {
                        p._id,
                        Invoice = p.invoiceNo,
                        Date = p.invoiceDate.ToString("dd/MM/yyyy"),
                        Supplier = SupplierModel.GetName(p.supplier),
                        Total = p.totalAmount
                    }).ToList();
                    if (grid.Columns["_id"] != null) grid.Columns["_id"].Visible = false;
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Inv Error: " + ex.Message);
            }
        }

        private void OpenItemSearch()
        {
            var search = new SearchForm(_config.ServerUrl, _token ?? "", false);
            if (search.ShowDialog() == DialogResult.OK && search.SelectedResult != null)
            {
                dynamic res = search.SelectedResult;
                string resId = res._id?.ToString() ?? "";
                string resName = res.Name?.ToString() ?? "";
                string resCode = res.Code?.ToString() ?? "";
                string resBarcode = res.Barcode?.ToString() ?? "";
                string resCompany = "";
                try { resCompany = res.Company?.ToString() ?? ""; } catch {}
                decimal resPrice = 0;
                try { resPrice = Convert.ToDecimal(res.Price); } catch {}

                var item = _allItems.FirstOrDefault(i => i._id == resId);
                if (item == null)
                {
                    _printList.Add(new BarcodePrintItem
                    {
                        ItemId = resId,
                        Name = resName,
                        Code = resCode,
                        Barcode = resBarcode,
                        CompanyName = !string.IsNullOrWhiteSpace(_config.CompanyHeader) ? _config.CompanyHeader : "D Watson Pharmacy & Super Sto",
                        Price = resPrice,
                        Qty = 1
                    });
                }
                else
                {
                    _printList.Add(new BarcodePrintItem
                    {
                        ItemId = item._id,
                        Name = item.name,
                        Code = item.itemsCode,
                        Barcode = item.barcode,
                        CompanyName = !string.IsNullOrWhiteSpace(_config.CompanyHeader) ? _config.CompanyHeader : "D Watson Pharmacy & Super Sto",
                        Price = item.retailPrice,
                        Qty = 1
                    });
                }
                RefreshPrintGrid();
            }
        }

        private async void OpenPurchaseSearch()
        {
            var search = new SearchForm(_config.ServerUrl, _token ?? "", true);
            if (search.ShowDialog() == DialogResult.OK && search.SelectedResult != null)
            {
                dynamic res = search.SelectedResult;
                string purchaseId = res._id?.ToString() ?? "";
                if (!string.IsNullOrEmpty(purchaseId))
                {
                    await FetchPurchaseItems(purchaseId);
                }
            }
        }

        private async Task FetchPurchaseItems(string purchaseId)
        {
            try
            {
                var request = new RestRequest($"/api/v1/wh-purchases/{purchaseId}", Method.Get);
                AddAuthHeaders(request);

                var response = await _client.ExecuteAsync(request);
                if (response.IsSuccessful)
                {
                    var result = JsonConvert.DeserializeObject<ApiResponse<WHPurchase>>(response.Content);
                    var purchase = result?.data;
                    if (purchase != null && purchase.items.Count > 0)
                    {
                        var txtInv = (TextBox?)this.Controls.Find("txtInv", true).FirstOrDefault();
                        if (txtInv != null) txtInv.Text = purchase.invoiceNo;

                        var txtDate = (TextBox?)this.Controls.Find("txtDate", true).FirstOrDefault();
                        if (txtDate != null) txtDate.Text = purchase.invoiceDate.ToString("dd/MM/yyyy");

                        // Open selected invoice's items: clear queue and load all invoice items
                        _printList.Clear();

                        string storeHeader = !string.IsNullOrWhiteSpace(_config.CompanyHeader) ? _config.CompanyHeader : "D Watson Pharmacy & Super Sto";

                        foreach (var pItem in purchase.items)
                        {
                            string itemId = pItem._id;
                            string itemName = "";
                            string itemCode = "";
                            string itemBarcode = "";
                            decimal itemPrice = 0;
                            int itemQty = (int)Math.Max(1, Math.Round(pItem.quantity));

                            var wh = pItem.GetWHItem();
                            if (wh != null)
                            {
                                itemId = wh._id;
                                itemName = wh.name;
                                itemCode = wh.itemsCode;
                                itemBarcode = wh.barcode;
                                itemPrice = wh.retailPrice > 0 ? wh.retailPrice : (wh.salePrice > 0 ? wh.salePrice : pItem.salePrice);
                            }

                            if (string.IsNullOrEmpty(itemName)) itemName = !string.IsNullOrEmpty(pItem.name) ? pItem.name : pItem.itemName;
                            if (string.IsNullOrEmpty(itemBarcode)) itemBarcode = pItem.barcode;
                            if (string.IsNullOrEmpty(itemCode)) itemCode = itemBarcode;
                            if (itemPrice <= 0) itemPrice = pItem.salePrice > 0 ? pItem.salePrice : pItem.costPrice;

                            _printList.Add(new BarcodePrintItem
                            {
                                ItemId = itemId,
                                Name = itemName,
                                Code = itemCode,
                                Barcode = itemBarcode,
                                CompanyName = storeHeader,
                                Price = itemPrice,
                                Qty = itemQty
                            });
                        }

                        RefreshPrintGrid();
                        int totalLabels = _printList.Sum(p => p.Qty);
                        MessageBox.Show(
                            $"Successfully loaded {purchase.items.Count} items ({totalLabels} total labels to print) from Invoice #{purchase.invoiceNo}.\n\n" +
                            "Press [Ctrl + P] or [F5] anytime to print all barcodes.", 
                            "Invoice Items Loaded", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    }
                    else
                    {
                        MessageBox.Show("This purchase invoice does not have any items.", "Empty Invoice", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    }
                }
                else
                {
                    MessageBox.Show("Purchase not found or error: " + response.StatusDescription);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Purchase Loading Error: " + ex.Message);
            }
        }

        private void AddAuthHeaders(RestRequest request)
        {
            request.AddHeader("ngrok-skip-browser-warning", "69420");
            request.AddHeader("User-Agent", "BarcodeApp/1.0");
            if (!string.IsNullOrEmpty(_token))
            {
                request.AddHeader("Authorization", "Bearer " + _token);
            }
            else
            {
                request.AddHeader("bas-secret-key", _config.SecretKey);
            }
        }

        private void AddToPrintList(DataGridViewSelectedRowCollection rows)
        {
            foreach (DataGridViewRow row in rows)
            {
                if (row.Index < 0 || row.Index >= _allItems.Count) continue;
                var item = _allItems[row.Index];
                var existing = _printList.FirstOrDefault(p => p.ItemId == item._id);
                if (existing != null)
                {
                    existing.Qty++;
                }
                else
                {
                    _printList.Add(new BarcodePrintItem
                    {
                        ItemId = item._id,
                        Name = item.name,
                        Code = item.itemsCode,
                        Barcode = item.barcode,
                        CompanyName = !string.IsNullOrWhiteSpace(_config.CompanyHeader) ? _config.CompanyHeader : "D Watson Pharmacy & Super Sto",
                        Price = item.retailPrice,
                        Qty = 1
                    });
                }
            }
            RefreshPrintGrid();
        }
    }

    public class BarcodePrintItem
    {
        public string ItemId { get; set; } = "";
        public string Name { get; set; } = "";
        public string Code { get; set; } = "";
        public string Barcode { get; set; } = "";
        public string CompanyName { get; set; } = "";
        public decimal Price { get; set; }
        public int Qty { get; set; }
    }

    public class PrintGridRow
    {
        public string Name { get; set; } = "";
        public string Barcode { get; set; } = "";
        public string Code { get; set; } = "";
        public decimal Price { get; set; }
        public int Qty { get; set; }
    }
}
