using System;
using System.Drawing;
using System.Windows.Forms;
using System.Collections.Generic;
using System.Linq;
using RestSharp;
using Newtonsoft.Json;

namespace BarcodePrintingApp
{
    public partial class SearchForm : Form
    {
        private RestClient _client;
        private string _token;
        public object SelectedResult { get; private set; }
        public bool IsPurchaseSearch { get; set; }

        private TextBox txtSearch;
        private DataGridView dgvResults;
        private Button btnSearch;

        public SearchForm(string baseUrl, string token, bool isPurchase = false)
        {
            _client = new RestClient(baseUrl);
            _token = token;
            IsPurchaseSearch = isPurchase;

            InitializeComponent();
        }

        private void InitializeComponent()
        {
            this.Text = IsPurchaseSearch ? "Select Purchase Invoice" : "Search Product Inventory";
            this.Size = new Size(800, 500);
            this.StartPosition = FormStartPosition.CenterParent;
            this.BackColor = Color.FromArgb(235, 235, 225);

            var pnlTop = new Panel { Dock = DockStyle.Top, Height = 65, Padding = new Padding(15) };
            var lbl = new Label { Text = "Keyword:", Location = new Point(15, 23), AutoSize = true, Font = new Font("Segoe UI", 9F) };
            txtSearch = new TextBox { Location = new Point(85, 20), Width = 350, Font = new Font("Segoe UI", 11F) };
            btnSearch = new Button { 
                Text = "FIND NOW", Location = new Point(450, 18), Width = 140, Height = 34,
                BackColor = Color.FromArgb(43, 88, 118), ForeColor = Color.White, FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI Bold", 9F)
            };
            btnSearch.Click += async (s, e) => await PerformSearch();
            txtSearch.KeyDown += async (s, e) => { if (e.KeyCode == Keys.Enter) await PerformSearch(); };
            pnlTop.Controls.AddRange(new Control[] { lbl, txtSearch, btnSearch });

            var pnlBot = new Panel { Dock = DockStyle.Bottom, Height = 60, Padding = new Padding(10) };
            var btnOk = new Button { 
                Text = "SELECT", Anchor = AnchorStyles.Right | AnchorStyles.Top, 
                Location = new Point(560, 15), Width = 100, Height = 32, 
                BackColor = Color.FromArgb(25, 135, 84), ForeColor = Color.White, FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI Bold", 9F)
            };
            var btnCancel = new Button { 
                Text = "CANCEL", Anchor = AnchorStyles.Right | AnchorStyles.Top, 
                Location = new Point(670, 15), Width = 90, Height = 32, FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI", 9F)
            };
            btnOk.Click += (s, e) => AcceptSelection();
            btnCancel.Click += (s, e) => this.Close();
            pnlBot.Controls.AddRange(new Control[] { btnOk, btnCancel });

            dgvResults = new DataGridView { 
                Dock = DockStyle.Fill, 
                AllowUserToAddRows = false, 
                ReadOnly = true, 
                SelectionMode = DataGridViewSelectionMode.FullRowSelect,
                BackgroundColor = Color.White,
                AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
                RowTemplate = { Height = 35 },
                Font = new Font("Segoe UI", 9F)
            };
            dgvResults.DoubleClick += (s, e) => AcceptSelection();

            // Ensure correct docking order: Add Top/Bottom first, then Fill
            this.Controls.Clear();
            this.Controls.Add(dgvResults);
            this.Controls.Add(pnlTop);
            this.Controls.Add(pnlBot);
            dgvResults.SendToBack(); // Fill takes what Top/Bottom don't
        }

        private async System.Threading.Tasks.Task PerformSearch()
        {
            string keyword = txtSearch.Text;
            var request = new RestRequest(IsPurchaseSearch ? "/api/v1/wh-purchases" : "/api/v1/wh-items", Method.Get);
            if (!string.IsNullOrEmpty(_token)) request.AddHeader("Authorization", "Bearer " + _token);
            
            if (IsPurchaseSearch) request.AddQueryParameter("keyword", keyword);
            else request.AddQueryParameter("search", keyword);
            
            request.AddQueryParameter("limit", "50");

            try {
                var response = await _client.ExecuteAsync(request);
                if (response.IsSuccessful) {
                    if (IsPurchaseSearch) {
                        var res = JsonConvert.DeserializeObject<ApiListResponse<WHPurchase>>(response.Content);
                        dgvResults.DataSource = res?.data.Select(p => new {
                            p._id,
                            Invoice = p.invoiceNo,
                            Date = p.invoiceDate.ToString("dd/MM/yyyy"),
                            Supplier = SupplierModel.GetName(p.supplier),
                            Total = p.totalAmount
                        }).ToList();
                    } else {
                        var res = JsonConvert.DeserializeObject<ApiListResponse<WHItem>>(response.Content);
                        dgvResults.DataSource = res?.data.Select(i => new {
                            i._id,
                            Code = i.itemsCode,
                            Name = i.name,
                            Price = i.retailPrice,
                            Barcode = i.barcode,
                            Company = i.GetCompanyName()
                        }).ToList();
                    }
                    if (dgvResults.Columns["_id"] != null) dgvResults.Columns["_id"].Visible = false;
                }
            } catch (Exception ex) { MessageBox.Show("Search Error: " + ex.Message); }
        }

        private void AcceptSelection()
        {
            if (dgvResults.SelectedRows.Count > 0) {
                SelectedResult = dgvResults.SelectedRows[0].DataBoundItem;
                this.DialogResult = DialogResult.OK;
                this.Close();
            }
        }
    }
}
