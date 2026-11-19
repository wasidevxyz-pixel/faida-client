using System;
using System.IO;
using System.Text.Json;

namespace BarcodePrintingApp
{
    public class Config
    {
        public string ServerUrl { get; set; } = "https://bas.dwatson.online";
        public string SecretKey { get; set; } = "";
        public string Branch { get; set; } = "";
        public string SelectedPrinter { get; set; } = "";
        public string SelectedLabelSize { get; set; } = "38mm x 25mm (1.5\" x 1.0\") - Standard Tag (Matches Photo)";
        public string CompanyHeader { get; set; } = "D Watson Pharmacy & Super Sto";
        public int LabelWidthMm { get; set; } = 38;
        public int LabelHeightMm { get; set; } = 25;
        public int TopOffsetMm { get; set; } = 0;

        public static string GetConfigPath()
        {
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string baseConfig = Path.Combine(baseDir, "appsettings.json");
                if (File.Exists(baseConfig)) return baseConfig;

                string cwdConfig = Path.Combine(Directory.GetCurrentDirectory(), "appsettings.json");
                if (File.Exists(cwdConfig)) return cwdConfig;

                return baseConfig;
            }
            catch
            {
                return "appsettings.json";
            }
        }

        public static Config Load()
        {
            Config config = null;
            string configPath = GetConfigPath();
            try
            {
                if (File.Exists(configPath))
                {
                    string json = File.ReadAllText(configPath);
                    config = JsonSerializer.Deserialize<Config>(json);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("Warning loading appsettings.json: " + ex.Message);
            }

            if (config == null)
            {
                config = new Config();
            }

            if (!string.IsNullOrWhiteSpace(config.ServerUrl))
            {
                config.ServerUrl = config.ServerUrl.Trim();
                if (!config.ServerUrl.StartsWith("http://", StringComparison.OrdinalIgnoreCase) && 
                    !config.ServerUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
                {
                    config.ServerUrl = "https://" + config.ServerUrl;
                }
            }

            // Allow environment variables to override
            string envUrl = Environment.GetEnvironmentVariable("BAS_SERVER_URL");
            if (!string.IsNullOrWhiteSpace(envUrl)) config.ServerUrl = envUrl.Trim();

            string envKey = Environment.GetEnvironmentVariable("BAS_SECRET_KEY");
            if (!string.IsNullOrWhiteSpace(envKey)) config.SecretKey = envKey.Trim();

            string envBranch = Environment.GetEnvironmentVariable("BAS_BRANCH");
            if (!string.IsNullOrWhiteSpace(envBranch)) config.Branch = envBranch.Trim();

            string envPrinter = Environment.GetEnvironmentVariable("BAS_PRINTER");
            if (!string.IsNullOrWhiteSpace(envPrinter)) config.SelectedPrinter = envPrinter.Trim();

            if (!File.Exists(configPath))
            {
                Save(config);
            }

            return config;
        }

        public static void Save(Config config)
        {
            try {
                string configPath = GetConfigPath();
                string json = JsonSerializer.Serialize(config, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(configPath, json);
            } catch (Exception ex) {
                Console.WriteLine("Error saving config: " + ex.Message);
            }
        }
    }
}
