using System;
using System.Drawing;
using System.Windows.Forms;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using RestSharp;
using Newtonsoft.Json;

namespace BarcodePrintingApp
{
    public partial class SearchForm : Form
    {
        private RestClient _client;
        private string _token;
        public object? SelectedResult { get; private set; }
        public bool IsPurchaseSearch { get; set; }

        private TextBox txtSearch = null!;
        private DataGridView dgvResults = null!;
        private Button btnSearch = null!;
        private CheckBox chkOnlyPosted = null!;
        private Label lblStatus = null!;
        private List<WHPurchase> _allPurchases = new();
        private List<WHItem> _allItems = new();

        public SearchForm(string baseUrl, string token, bool isPurchase = false)
        {
            string cleanBase = (baseUrl ?? "").Trim();
            if (!cleanBase.StartsWith("http://", StringComparison.OrdinalIgnoreCase) && 
                !cleanBase.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            {
                cleanBase = "https://" + cleanBase;
            }
            _client = new RestClient(cleanBase);
            _token = token;
            IsPurchaseSearch = isPurchase;

            InitializeComponent();
            
            // Auto-load data immediately on dialog open
            this.Load += async (s, e) => await PerformSearch();
        }

        private void InitializeComponent()
        {
            this.Text = IsPurchaseSearch ? "Select Posted Purchase Invoice" : "Search Product Inventory Catalog";
            this.Size = new Size(IsPurchaseSearch ? 980 : 850, 560);
            this.MinimumSize = new Size(750, 450);
            this.StartPosition = FormStartPosition.CenterParent;
            this.BackColor = Color.FromArgb(235, 235, 225);

            // Top Search / Filter Bar
            var pnlTop = new Panel { Dock = DockStyle.Top, Height = 75, Padding = new Padding(12) };
            
            var lbl = new Label
            {
                Text = IsPurchaseSearch ? "Search Invoice / Supplier:" : "Search Name / Code / Barcode:",
                Location = new Point(12, 12),
                AutoSize = true,
                Font = new Font("Segoe UI Semibold", 9F)
            };

            txtSearch = new TextBox
            {
                Location = new Point(12, 33),
                Width = IsPurchaseSearch ? 380 : 420,
                Font = new Font("Segoe UI", 10.5F)
            };
            txtSearch.TextChanged += (s, e) => ApplyLocalFilter();
            txtSearch.KeyDown += async (s, e) => {
                if (e.KeyCode == Keys.Enter)
                {
                    if (dgvResults.SelectedRows.Count > 0) AcceptSelection();
                    else await PerformSearch();
                }
            };

            btnSearch = new Button
            {
                Text = "🔄 REFRESH",
                Location = new Point(IsPurchaseSearch ? 402 : 442, 31),
                Width = 110,
                Height = 32,
                BackColor = Color.FromArgb(43, 88, 118),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI Bold", 9F),
                Cursor = Cursors.Hand
            };
            btnSearch.Click += async (s, e) => await PerformSearch();

            pnlTop.Controls.AddRange(new Control[] { lbl, txtSearch, btnSearch });

            if (IsPurchaseSearch)
            {
                chkOnlyPosted = new CheckBox
                {
                    Text = "☑ Posted Invoices Only",
                    Checked = true,
                    Location = new Point(525, 36),
                    AutoSize = true,
                    Font = new Font("Segoe UI Semibold", 9.5F),
                    ForeColor = Color.FromArgb(25, 135, 84),
                    Cursor = Cursors.Hand
                };
                chkOnlyPosted.CheckedChanged += (s, e) => ApplyLocalFilter();
                pnlTop.Controls.Add(chkOnlyPosted);
            }

            lblStatus = new Label
            {
                Text = "Loading...",
                Location = new Point(IsPurchaseSearch ? 720 : 570, 38),
                AutoSize = true,
                ForeColor = Color.FromArgb(60, 60, 60),
                Font = new Font("Segoe UI", 8.5F)
            };
            pnlTop.Controls.Add(lblStatus);

            // Bottom Buttons Bar
            var pnlBot = new Panel { Dock = DockStyle.Bottom, Height = 55, Padding = new Padding(10) };
            
            var btnOk = new Button
            {
                Text = IsPurchaseSearch ? "LOAD INVOICE ITEMS" : "SELECT ITEM",
                Anchor = AnchorStyles.Right | AnchorStyles.Top,
                Location = new Point(this.ClientSize.Width - 260, 10),
                Width = 145,
                Height = 35,
                BackColor = Color.FromArgb(25, 135, 84),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI Bold", 9F),
                Cursor = Cursors.Hand
            };

            var btnCancel = new Button
            {
                Text = "CANCEL",
                Anchor = AnchorStyles.Right | AnchorStyles.Top,
                Location = new Point(this.ClientSize.Width - 105, 10),
                Width = 95,
                Height = 35,
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(108, 117, 125),
                ForeColor = Color.White,
                Font = new Font("Segoe UI", 9F),
                Cursor = Cursors.Hand
            };

            btnOk.Click += (s, e) => AcceptSelection();
            btnCancel.Click += (s, e) => this.Close();
            pnlBot.Controls.AddRange(new Control[] { btnOk, btnCancel });

            // Results DataGridView
            dgvResults = new DataGridView
            {
                Dock = DockStyle.Fill,
                AllowUserToAddRows = false,
                ReadOnly = true,
                SelectionMode = DataGridViewSelectionMode.FullRowSelect,
                MultiSelect = false,
                BackgroundColor = Color.White,
                AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
                RowTemplate = { Height = 30 },
                Font = new Font("Segoe UI", 9.5F)
            };
            dgvResults.DoubleClick += (s, e) => AcceptSelection();
            dgvResults.KeyDown += (s, e) => {
                if (e.KeyCode == Keys.Enter)
                {
                    AcceptSelection();
                    e.Handled = true;
                }
            };

            this.Controls.Clear();
            this.Controls.Add(dgvResults);
            this.Controls.Add(pnlTop);
            this.Controls.Add(pnlBot);
            dgvResults.BringToFront();
        }

        private async Task PerformSearch()
        {
            lblStatus.Text = "Fetching from server...";
            btnSearch.Enabled = false;

            try
            {
                string endpoint = IsPurchaseSearch ? "/api/v1/wh-purchases" : "/api/v1/wh-items";
                var request = new RestRequest(endpoint, Method.Get);
                request.AddHeader("ngrok-skip-browser-warning", "69420");
                request.AddHeader("User-Agent", "BarcodeApp/1.0");
                if (!string.IsNullOrEmpty(_token)) request.AddHeader("Authorization", "Bearer " + _token);

                if (!IsPurchaseSearch && !string.IsNullOrWhiteSpace(txtSearch.Text))
                {
                    request.AddQueryParameter("search", txtSearch.Text.Trim());
                }

                request.AddQueryParameter("limit", "100");

                var response = await _client.ExecuteAsync(request);
                if (response.IsSuccessful)
                {
                    if (IsPurchaseSearch)
                    {
                        var res = JsonConvert.DeserializeObject<ApiListResponse<WHPurchase>>(response.Content);
                        _allPurchases = res?.data ?? new();
                        ApplyLocalFilter();
                    }
                    else
                    {
                        var res = JsonConvert.DeserializeObject<ApiListResponse<WHItem>>(response.Content);
                        _allItems = res?.data ?? new();
                        ApplyLocalFilter();
                    }
                }
                else
                {
                    lblStatus.Text = "Failed: " + response.StatusDescription;
                }
            }
            catch (Exception ex)
            {
                lblStatus.Text = "Error: " + ex.Message;
            }
            finally
            {
                btnSearch.Enabled = true;
            }
        }

        private void ApplyLocalFilter()
        {
            string q = txtSearch.Text.Trim().ToLower();

            if (IsPurchaseSearch)
            {
                var query = _allPurchases.AsEnumerable();

                if (chkOnlyPosted != null && chkOnlyPosted.Checked)
                {
                    query = query.Where(p => string.Equals(p.status, "Posted", StringComparison.OrdinalIgnoreCase));
                }

                if (!string.IsNullOrEmpty(q))
                {
                    query = query.Where(p =>
                        (p.invoiceNo != null && p.invoiceNo.ToLower().Contains(q)) ||
                        (p.GetSupplierName().ToLower().Contains(q)) ||
                        (p.postingNumber.HasValue && p.postingNumber.Value.ToString().Contains(q))
                    );
                }

                var list = query.Select(p => new
                {
                    p._id,
                    Invoice = p.invoiceNo,
                    PostNo = p.postingNumber.HasValue ? p.postingNumber.Value.ToString() : "-",
                    Date = p.invoiceDate.ToString("dd/MM/yyyy"),
                    Supplier = p.GetSupplierName(),
                    Status = p.status,
                    ItemsCount = p.items != null ? p.items.Count : 0,
                    TotalAmount = "Rs: " + p.totalAmount.ToString("N2")
                }).ToList();

                dgvResults.DataSource = list;

                if (dgvResults.Columns["_id"] != null) dgvResults.Columns["_id"].Visible = false;
                if (dgvResults.Columns["Invoice"] != null) dgvResults.Columns["Invoice"].HeaderText = "Invoice #";
                if (dgvResults.Columns["PostNo"] != null) dgvResults.Columns["PostNo"].HeaderText = "Post #";
                if (dgvResults.Columns["Supplier"] != null) dgvResults.Columns["Supplier"].HeaderText = "Supplier Name";
                if (dgvResults.Columns["ItemsCount"] != null) dgvResults.Columns["ItemsCount"].HeaderText = "Items";
                if (dgvResults.Columns["TotalAmount"] != null) dgvResults.Columns["TotalAmount"].HeaderText = "Total Net";

                lblStatus.Text = $"{list.Count} Invoices Displayed";
            }
            else
            {
                var query = _allItems.AsEnumerable();
                if (!string.IsNullOrEmpty(q))
                {
                    query = query.Where(i =>
                        (i.name != null && i.name.ToLower().Contains(q)) ||
                        (i.itemsCode != null && i.itemsCode.ToLower().Contains(q)) ||
                        (i.barcode != null && i.barcode.ToLower().Contains(q)) ||
                        (i.GetCompanyName().ToLower().Contains(q))
                    );
                }

                var list = query.Select(i => new
                {
                    i._id,
                    Code = i.itemsCode,
                    Name = i.name,
                    Price = i.retailPrice,
                    Barcode = i.barcode,
                    Company = i.GetCompanyName()
                }).ToList();

                dgvResults.DataSource = list;
                if (dgvResults.Columns["_id"] != null) dgvResults.Columns["_id"].Visible = false;

                lblStatus.Text = $"{list.Count} Products Displayed";
            }
        }

        private void AcceptSelection()
        {
            if (dgvResults.SelectedRows.Count > 0)
            {
                SelectedResult = dgvResults.SelectedRows[0].DataBoundItem;
                this.DialogResult = DialogResult.OK;
                this.Close();
            }
        }
    }
}
