using System;
using System.Collections.Generic;

namespace BarcodePrintingApp
{
    public class WHItem
    {
        public string _id { get; set; } = "";
        public string name { get; set; } = "";
        public string itemsCode { get; set; } = "";
        public string barcode { get; set; } = "";
        public decimal costPrice { get; set; }
        public decimal salePrice { get; set; }
        public decimal retailPrice { get; set; }
        public object? company { get; set; }
        public object? category { get; set; }
        public object? itemClass { get; set; }
        public object? subClass { get; set; }

        public string GetCompanyName() => GetModelName(company);
        public string GetCategoryName() => GetModelName(category);

        private string GetModelName(object? obj)
        {
            if (obj == null) return "";
            if (obj is string s) return ""; // It's just an ID
            if (obj is Newtonsoft.Json.Linq.JObject jo) return jo["name"]?.ToString() ?? "";
            return "";
        }
        public List<StockModel> stock { get; set; } = new();
    }

    public class NameModel
    {
        public string _id { get; set; } = "";
        public string name { get; set; } = "";
    }

    public class StockModel
    {
        public object? store { get; set; } 
        public decimal quantity { get; set; }
    }

    public class WHPurchase
    {
        public string _id { get; set; } = "";
        public string invoiceNo { get; set; } = "";
        public DateTime invoiceDate { get; set; }
        public SupplierModel? supplier { get; set; }
        public string status { get; set; } = "";
        public decimal totalAmount { get; set; }
        public List<PurchaseItemModel> items { get; set; } = new();
    }

    public class SupplierModel
    {
        public string _id { get; set; } = "";
        public string supplierName { get; set; } = "";

        public static string GetName(object? obj)
        {
            if (obj == null) return "";
            if (obj is Newtonsoft.Json.Linq.JObject jo) return jo["supplierName"]?.ToString() ?? "";
            return "";
        }
    }

    public class PurchaseItemModel
    {
        public string _id { get; set; } = "";
        public object? item { get; set; }
        public decimal quantity { get; set; }
        public decimal costPrice { get; set; }
        public decimal total { get; set; }

        public WHItem? GetWHItem()
        {
            if (item == null) return null;
            if (item is WHItem wh) return wh;
            if (item is Newtonsoft.Json.Linq.JObject jo) return jo.ToObject<WHItem>();
            // If it's just a string ID, we can't get the details here without another API call,
            // but at least it won't crash.
            return null;
        }
    }

    public class ApiResponse<T>
    {
        public bool success { get; set; }
        public string? message { get; set; }
        public T? data { get; set; }
    }

    public class ApiListResponse<T>
    {
        public bool success { get; set; }
        public int count { get; set; }
        public List<T> data { get; set; } = new();
    }

    public class LoginRequest
    {
        public string email { get; set; } = "";
        public string password { get; set; } = "";
    }

    public class LoginResponse
    {
        public bool success { get; set; }
        public string? token { get; set; }
        public UserData? user { get; set; }
        public string? message { get; set; }
    }

    public class UserData
    {
        public string id { get; set; } = "";
        public string name { get; set; } = "";
        public string email { get; set; } = "";
        public string role { get; set; } = "";
        public object? branch { get; set; }
    }
}
