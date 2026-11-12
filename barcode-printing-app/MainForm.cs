using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Linq;
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
            _client = new RestClient(_config.ServerUrl);
            
            this.Text = "WASEELA V9 : BAS Barcode Label Printing (Label: 1.5\" x 1.1\")";
            this.Size = new Size(1100, 750);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = Color.FromArgb(235, 235, 225); // Legacy ERP background color

            SetupUI();
            LoadPrinters();
        }

        private void SetupUI()
        {
            this.Controls.Clear();
            this.BackColor = Color.FromArgb(235, 235, 225);

            // --- TOP HEADER ---
            var pnlHead = new Panel { 
                Dock = DockStyle.Top, 
                Height = 40, 
                BackColor = Color.FromArgb(43, 88, 118)
            };
            var lblAppTitle = new Label { 
                Text = "WASEELA V9 - BarCode Label Printing", 
                ForeColor = Color.White, 
                Font = new Font("Segoe UI Semibold", 11F), 
                Location = new Point(15, 8), 
                AutoSize = true 
            };
            pnlHead.Controls.Add(lblAppTitle);
            this.Controls.Add(pnlHead);

            // --- TABS (Main Content Area) ---
            var tabs = new TabControl { 
                Dock = DockStyle.Fill, 
                Padding = new Point(15, 6), 
                Font = new Font("Segoe UI Semibold", 10F),
                Name = "mainTabs"
            };
            this.Controls.Add(tabs);
            
            // Critical docking order fix
            pnlHead.BringToFront();
            tabs.SendToBack();

            var tabDetail = new TabPage { Text = "     Detail     ", BackColor = Color.FromArgb(235, 235, 225) };
            var tabList = new TabPage { Text = "     List / Search     ", BackColor = Color.FromArgb(235, 235, 225) };

            tabs.TabPages.Add(tabDetail);
            tabs.TabPages.Add(tabList);

            // --- DETAIL TAB LAYOUT ---
            var detailLayout = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2 };
            detailLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 40));
            detailLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 60));

            // Detail Inputs (Left)
            var pnlInputs = new Panel { Dock = DockStyle.Fill, Padding = new Padding(10) };
            
            var lblSearchTitle = new Label { Text = "DATA LOOKUP / SEARCH:", Font = new Font("Segoe UI", 9F, FontStyle.Bold), Location = new Point(10, 10), AutoSize = true };
            
            var btnOpenSearch = new Button { 
                Text = "🔍 SEARCH ITEM BY NAME / CODE", 
                Location = new Point(10, 35), 
                Width = 380, Height = 45, 
                BackColor = Color.FromArgb(43, 88, 118), 
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat, Font = new Font("Segoe UI Bold", 10F) 
            };
            btnOpenSearch.Click += (s, e) => OpenItemSearch();

            var btnOpenPurchases = new Button { 
                Text = "📄 SELECT PURCHASE INVOICE FROM LIST", 
                Location = new Point(10, 85), 
                Width = 380, Height = 45, 
                BackColor = Color.FromArgb(108, 117, 125), 
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat, Font = new Font("Segoe UI Bold", 10F) 
            };
            btnOpenPurchases.Click += (s, e) => OpenPurchaseSearch();

            // --- Manual Add Section ---
            var gbManual = new GroupBox { Text = "Quick Manual Entry", Width = 380, Height = 100, Location = new Point(10, 145), Font = new Font("Segoe UI", 9F, FontStyle.Bold) };
            var lblMBc = new Label { Text = "Barcode / Code:", Location = new Point(10, 25), AutoSize = true, Font = new Font("Segoe UI", 9F, FontStyle.Regular) };
            var txtManualBc = new TextBox { Name = "txtManualBc", Width = 150, Location = new Point(10, 45) };
            var lblMQty = new Label { Text = "Qty:", Location = new Point(170, 25), AutoSize = true, Font = new Font("Segoe UI", 9F, FontStyle.Regular) };
            var txtManualQty = new TextBox { Name = "txtManualQty", Width = 50, Location = new Point(170, 45), Text = "1" };
            var btnManualAdd = new Button { 
                Text = "ADD", Location = new Point(230, 43), Width = 140, Height = 28,
                BackColor = Color.FromArgb(25, 135, 84), ForeColor = Color.White, FlatStyle = FlatStyle.Flat 
            };
            btnManualAdd.Click += async (s, e) => await AddManualBarcode(txtManualBc.Text, txtManualQty.Text);
            txtManualBc.KeyDown += async (s, e) => { if (e.KeyCode == Keys.Enter) await AddManualBarcode(txtManualBc.Text, txtManualQty.Text); };
            gbManual.Controls.AddRange(new Control[] { lblMBc, txtManualBc, lblMQty, txtManualQty, btnManualAdd });

            var lblInv = new Label { Text = "Active Invoice:", Location = new Point(10, 265), AutoSize = true };
            var txtInv = new TextBox { Name = "txtInv", Width = 150, Location = new Point(110, 263), ReadOnly = true, BackColor = Color.WhiteSmoke };
            
            var lblAlias = new Label { Text = "Alias Name:", Location = new Point(10, 295), AutoSize = true };
            var txtAlias = new TextBox { Name = "txtAlias", Width = 250, Location = new Point(110, 293) };

            var lblDate = new Label { Text = "Date:", Location = new Point(10, 325), AutoSize = true };
            var txtDate = new TextBox { Name = "txtDate", Width = 150, Location = new Point(110, 323), ReadOnly = true, Text = DateTime.Now.ToString("dd/MM/yyyy") };

            var lblPrinter = new Label { Text = "Printer:", Location = new Point(10, 355), AutoSize = true };
            var cmbPrinters = new ComboBox { Name = "cmbPrinters", Width = 250, Location = new Point(110, 353), DropDownStyle = ComboBoxStyle.DropDownList };

            var btnPrint = new Button { 
                Text = "PRINT BARCODES", 
                Location = new Point(110, 400), 
                Width = 250, 
                Height = 45,
                BackColor = Color.FromArgb(43, 88, 118), 
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI Bold", 10F)
            };
            btnPrint.Click += (s, e) => PrintReport();

            var btnClear = new Button { 
                Text = "CLEAR QUEUE", 
                Location = new Point(110, 455), 
                Width = 250, 
                Height = 35,
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(108, 117, 125),
                ForeColor = Color.White
            };
            btnClear.Click += (s, e) => { _printList.Clear(); RefreshPrintGrid(); };

            pnlInputs.Controls.AddRange(new Control[] { lblSearchTitle, btnOpenSearch, btnOpenPurchases, gbManual, lblInv, txtInv, lblAlias, txtAlias, lblDate, txtDate, lblPrinter, cmbPrinters, btnPrint, btnClear });

            // Print Queue Grid (Right)
            var dgvPrint = new DataGridView { 
                Name = "dgvPrint", 
                Dock = DockStyle.Fill,
                AllowUserToAddRows = false,
                BackgroundColor = Color.White,
                BorderStyle = BorderStyle.Fixed3D,
                AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
                SelectionMode = DataGridViewSelectionMode.CellSelect,
                EditMode = DataGridViewEditMode.EditOnEnter
            };
            dgvPrint.CellEndEdit += (s, e) => {
                if (e.ColumnIndex == 2) { // Qty Column
                    var val = dgvPrint.Rows[e.RowIndex].Cells[2].Value?.ToString();
                    if (int.TryParse(val, out int q)) _printList[e.RowIndex].Qty = q;
                }
            };
            detailLayout.Controls.Add(pnlInputs, 0, 0);
            detailLayout.Controls.Add(dgvPrint, 1, 0);
            tabDetail.Controls.Add(detailLayout);

            // --- LIST TAB LAYOUT (Purchases & Items) ---
            var listLayout = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 2 };
            listLayout.RowStyles.Add(new RowStyle(SizeType.Percent, 40)); // Top: Invoices
            listLayout.RowStyles.Add(new RowStyle(SizeType.Percent, 60)); // Bottom: Items

            // INVOICE SEARCH PANEL
            var pnlInvSearch = new Panel { Dock = DockStyle.Fill, Padding = new Padding(10) };
            var lblIS = new Label { Text = "SEARCH PURCHASES:", Font = new Font("Segoe UI", 9F, FontStyle.Bold), Location = new Point(10, 10), AutoSize = true };
            var txtISear = new TextBox { Name = "txtISear", Width = 200, Location = new Point(10, 35) };
            var btnISear = new Button { Text = "GET INVOICES", Location = new Point(220, 33), Width = 120, Height = 28, BackColor = Color.FromArgb(43, 88, 118), ForeColor = Color.White, FlatStyle = FlatStyle.Flat };
            var dgvInvoices = new DataGridView { 
                Name = "dgvInvoices", Location = new Point(10, 70), Width = 950, Height = 180, 
                AllowUserToAddRows = false, ReadOnly = true, SelectionMode = DataGridViewSelectionMode.FullRowSelect,
                BackgroundColor = Color.White, AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
                Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right
            };
            btnISear.Click += async (s, e) => await FetchInvoices(txtISear.Text);
            dgvInvoices.DoubleClick += async (s, e) => {
                if (dgvInvoices.SelectedRows.Count > 0) {
                    var id = dgvInvoices.SelectedRows[0].Cells["_id"].Value?.ToString();
                    if (!string.IsNullOrEmpty(id)) await FetchPurchaseItems(id);
                    tabs.SelectedTab = tabDetail;
                }
            };
            pnlInvSearch.Controls.AddRange(new Control[] { lblIS, txtISear, btnISear, dgvInvoices });

            // ITEM SEARCH PANEL
            var pnlItemSearch = new Panel { Dock = DockStyle.Fill, Padding = new Padding(10) };
            var lblItemS = new Label { Text = "FIND SINGLE ITEM / BARCODE:", Font = new Font("Segoe UI", 9F, FontStyle.Bold), Location = new Point(10, 10), AutoSize = true };
            var txtSearch = new TextBox { Name = "txtSearch", Width = 200, Location = new Point(10, 35) };
            var btnFetch = new Button { Text = "SEARCH ITEMS", Location = new Point(220, 33), Width = 120, Height = 28, BackColor = Color.FromArgb(43, 88, 118), ForeColor = Color.White, FlatStyle = FlatStyle.Flat };
            var dgvItems = new DataGridView { 
                Name = "dgvItems", Location = new Point(10, 70), Width = 950, Height = 350, 
                AllowUserToAddRows = false, ReadOnly = true, SelectionMode = DataGridViewSelectionMode.FullRowSelect,
                BackgroundColor = Color.White, AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
                Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right | AnchorStyles.Bottom
            };
            btnFetch.Click += async (s, e) => await FetchItems(txtSearch.Text);
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

        private void LoadPrinters()
        {
            var cmb = (ComboBox)this.Controls.Find("cmbPrinters", true)[0];
            foreach (string printer in System.Drawing.Printing.PrinterSettings.InstalledPrinters)
            {
                cmb.Items.Add(printer);
            }
            if (cmb.Items.Count > 0)
            {
                // Select default printer if available
                var settings = new System.Drawing.Printing.PrinterSettings();
                int idx = cmb.Items.IndexOf(settings.PrinterName);
                cmb.SelectedIndex = idx >= 0 ? idx : 0;
            }
        }

        private void RoundPanel(Panel pnl, int radius)
        {
            System.Drawing.Drawing2D.GraphicsPath path = new System.Drawing.Drawing2D.GraphicsPath();
            path.AddArc(0, 0, radius, radius, 180, 90);
            path.AddArc(pnl.Width - radius, 0, radius, radius, 270, 90);
            path.AddArc(pnl.Width - radius, pnl.Height - radius, radius, radius, 0, 90);
            path.AddArc(0, pnl.Height - radius, radius, radius, 90, 90);
            path.CloseFigure();
            pnl.Region = new Region(path);
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
            } catch (Exception ex) { MessageBox.Show("Inv Error: " + ex.Message); }
        }

        private void OpenItemSearch()
        {
            var search = new SearchForm(_config.ServerUrl, _token, false);
            if (search.ShowDialog() == DialogResult.OK && search.SelectedResult != null) {
                dynamic res = search.SelectedResult;
                var item = _allItems.FirstOrDefault(i => i._id == res._id);
                if (item == null) {
                    // Item might not be in _allItems cache, add manually
                    _printList.Add(new BarcodePrintItem {
                        ItemId = res._id, Name = res.Name, Code = res.Code, Barcode = res.Barcode, Price = res.Price, Qty = 1
                    });
                } else {
                    _printList.Add(new BarcodePrintItem {
                        ItemId = item._id, Name = item.name, Code = item.itemsCode, Barcode = item.barcode, 
                        CompanyName = item.GetCompanyName(), Price = item.retailPrice, Qty = 1
                    });
                }
                RefreshPrintGrid();
            }
        }

        private async void OpenPurchaseSearch()
        {
            var search = new SearchForm(_config.ServerUrl, _token, true);
            if (search.ShowDialog() == DialogResult.OK && search.SelectedResult != null) {
                dynamic res = search.SelectedResult;
                await FetchPurchaseItems(res._id);
            }
        }

        private async Task AddManualBarcode(string barcode, string qtyStr)
        {
            if (string.IsNullOrEmpty(barcode)) return;
            if (!int.TryParse(qtyStr, out int qty)) qty = 1;

            try {
                var request = new RestRequest("/api/v1/wh-items", Method.Get);
                AddAuthHeaders(request);
                request.AddQueryParameter("search", barcode);
                
                var response = await _client.ExecuteAsync(request);
                if (response.IsSuccessful) {
                    var result = JsonConvert.DeserializeObject<ApiListResponse<WHItem>>(response.Content);
                    var item = result?.data.FirstOrDefault(i => i.barcode == barcode || i.itemsCode == barcode);
                    if (item != null) {
                        var existing = _printList.FirstOrDefault(p => p.ItemId == item._id);
                        if (existing != null) existing.Qty += qty;
                        else _printList.Add(new BarcodePrintItem {
                            ItemId = item._id, Name = item.name, Code = item.itemsCode, Barcode = item.barcode, 
                            CompanyName = item.GetCompanyName(), Price = item.retailPrice, Qty = qty 
                        });
                        RefreshPrintGrid();
                        // Clear manual input for next scan
                        var txt = (TextBox)this.Controls.Find("txtManualBc", true)[0];
                        txt.Text = "";
                        txt.Focus();
                    } else { MessageBox.Show("Item not found with that barcode/code."); }
                }
            } catch (Exception ex) { MessageBox.Show("Error: " + ex.Message); }
        }

        private async Task FetchPurchaseItems(string purchaseId)
        {
            try
            {
                // Note: purchaseId here should be the MongoDB ID or we search by invoiceNo
                // For simplicity, let's assume we search by keyword first or provide direct ID
                var request = new RestRequest($"/api/v1/wh-purchases/{purchaseId}", Method.Get);
                AddAuthHeaders(request);

                var response = await _client.ExecuteAsync(request);
                if (response.IsSuccessful)
                {
                    var result = JsonConvert.DeserializeObject<ApiResponse<WHPurchase>>(response.Content);
                    var purchase = result?.data;
                    if (purchase != null && purchase.items.Count > 0)
                    {
                        var txtInv = (TextBox)this.Controls.Find("txtInv", true)[0];
                        txtInv.Text = purchase.invoiceNo;
                        
                        foreach (var pItem in purchase.items)
                        {
                            var item = pItem.GetWHItem();
                            if (item == null) continue;
                            
                            var existing = _printList.FirstOrDefault(x => x.ItemId == item._id);
                            if (existing != null) {
                                existing.Qty += (int)pItem.quantity;
                            } else {
                                _printList.Add(new BarcodePrintItem {
                                    ItemId = item._id,
                                    Name = item.name,
                                    Code = item.itemsCode,
                                    Barcode = item.barcode,
                                    CompanyName = item.GetCompanyName(),
                                    Price = item.retailPrice,
                                    Qty = (int)pItem.quantity
                                });
                            }
                        }
                        RefreshPrintGrid();
                        MessageBox.Show($"Loaded {purchase.items.Count} items from Purchase {purchase.invoiceNo}");
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
                var item = _allItems[row.Index];
                var existing = _printList.FirstOrDefault(p => p.ItemId == item._id);
                if (existing != null)
                {
                    existing.Qty++;
                }
                else
                {
                    _printList.Add(new BarcodePrintItem {
                        ItemId = item._id,
                        Name = item.name,
                        Code = item.itemsCode,
                        Barcode = item.barcode,
                        CompanyName = item.GetCompanyName(),
                        Price = item.retailPrice,
                        Qty = 1
                    });
                }
            }
            RefreshPrintGrid();
        }

        private void RefreshPrintGrid()
        {
            var grid = (DataGridView)this.Controls.Find("dgvPrint", true)[0];
            grid.DataSource = null;
            
            // Fix: Use a concrete class instead of anonymous object to allow editing Qty
            var bindingList = new System.ComponentModel.BindingList<PrintGridRow>(
                _printList.Select(p => new PrintGridRow {
                    Name = p.Name,
                    Price = p.Price,
                    Qty = p.Qty
                }).ToList()
            );
            
            grid.DataSource = bindingList;
            
            if (grid.Columns.Count > 0) {
                grid.Columns[0].ReadOnly = true; 
                grid.Columns[1].ReadOnly = true; 
                grid.Columns[2].ReadOnly = false; // Qty Edit is now safe
            }
        }

        private void PrintReport()
        {
            if (_printList.Count == 0)
            {
                MessageBox.Show("Print list is empty.");
                return;
            }

            var cmb = (ComboBox)this.Controls.Find("cmbPrinters", true)[0];
            string selectedPrinter = cmb.SelectedItem?.ToString() ?? "Default";

            // We use direct printing for precision and immediate use.
            // Crystal Reports files (.rpt) are binary and require the designer to create.
            // This built-in engine prints perfectly to 1.5" x 1.1" labels.

            var pd = new System.Drawing.Printing.PrintDocument();
            pd.PrinterSettings.PrinterName = selectedPrinter;
            
            // Set Page Size to 1.5" x 1.1" (150 x 110 in 1/100th inch units)
            pd.DefaultPageSettings.PaperSize = new System.Drawing.Printing.PaperSize("Custom", 150, 110);
            pd.DefaultPageSettings.Margins = new System.Drawing.Printing.Margins(5, 5, 5, 5);

            int currentItemIdx = 0;
            int currentQtyDone = 0;

            pd.PrintPage += (s, ev) => {
                var item = _printList[currentItemIdx];
                DrawLabel(ev.Graphics, item);

                currentQtyDone++;
                if (currentQtyDone >= item.Qty) {
                    currentItemIdx++;
                    currentQtyDone = 0;
                }

                ev.HasMorePages = (currentItemIdx < _printList.Count);
            };

            try {
                pd.Print();
                MessageBox.Show("Printing task sent successfully.");
            } catch (Exception ex) {
                MessageBox.Show("Printing Error: " + ex.Message);
            }
        }

        private void DrawLabel(Graphics g, BarcodePrintItem item)
        {
            // REFINE DESIGN TO MATCH ERP QUALITY (1.5" x 1.1")
            float width = 150;
            float height = 110;

            // Set high quality for barcode rendering (No smoothing/blurring)
            g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.NearestNeighbor;
            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.None;
            g.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;

            Font fontCompany = new Font("Arial", 6f, FontStyle.Bold);
            Font fontID = new Font("Arial Bold", 7.5f, FontStyle.Bold); 
            Font fontName = new Font("Arial Narrow", 7.5f, FontStyle.Bold);
            Font fontPrice = new Font("Arial Bold", 11f, FontStyle.Bold);

            // 1. Company Name (Top Center)
            string comp = string.IsNullOrEmpty(item.CompanyName) ? "D.WATSON" : item.CompanyName;
            var compSize = g.MeasureString(comp, fontCompany);
            g.DrawString(comp, fontCompany, Brushes.Black, (width - compSize.Width) / 2, 1);

            // 2. Barcode (Center upper part) - BOLD MEDICINE STYLE
            try {
                var writer = new BarcodeWriterPixelData
                {
                    Format = BarcodeFormat.CODE_128,
                    Options = new EncodingOptions
                    {
                        Height = 42,  // Reduced slightly to avoid overlap
                        Width = 125,
                        Margin = 0,
                        PureBarcode = true 
                    }
                };

                var pixelData = writer.Write(item.Barcode);
                using (var bitmap = new Bitmap(pixelData.Width, pixelData.Height, System.Drawing.Imaging.PixelFormat.Format32bppRgb))
                {
                    var bitmapData = bitmap.LockBits(
                        new Rectangle(0, 0, pixelData.Width, pixelData.Height),
                        System.Drawing.Imaging.ImageLockMode.WriteOnly,
                        System.Drawing.Imaging.PixelFormat.Format32bppRgb);
                    try {
                        System.Runtime.InteropServices.Marshal.Copy(pixelData.Pixels, 0, bitmapData.Scan0, pixelData.Pixels.Length);
                    } finally {
                        bitmap.UnlockBits(bitmapData);
                    }
                    // Draw at Y=11 to allow more gap from text
                    g.DrawImage(bitmap, (width - 125) / 2, 11);
                }
            } catch {
                g.DrawString("BC ERR", fontID, Brushes.Red, 15, 15);
            }

            // 3. Barcode Number (Human-Readable) - Show full 13-14 digits
            // We prioritize the scannable barcode string so it matches the lines
            string displayId = !string.IsNullOrEmpty(item.Barcode) ? item.Barcode : item.Code;
            if (string.IsNullOrEmpty(displayId)) displayId = "-";

            // If the number is very long, reduce font size slightly to fit width
            Font fontIDFinal = displayId.Length > 12 ? new Font("Arial Bold", 6.5f, FontStyle.Bold) : fontID;
            g.DrawString(displayId, fontIDFinal, Brushes.Black, 10, 57);

            // 4. Item Name
            string name = item.Name;
            if (name.Length > 30) name = name.Substring(0, 28) + "..";
            g.DrawString(name, fontName, Brushes.Black, 10, 69);

            // 5. Retail Price (Bottom persistent Rs format)
            string pStr = "Rs: " + item.Price.ToString("N0") + ".00";
            g.DrawString(pStr, fontPrice, Brushes.Black, 10, 89);
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
        public decimal Price { get; set; }
        public int Qty { get; set; }
    }
}
