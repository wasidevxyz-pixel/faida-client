using System;
using System.IO;
using System.Text.Json;

namespace BiometricApp
{
    public class Config
    {
        public string ServerUrl { get; set; } = "";
        public string SecretKey { get; set; } = "";
        public string Branch { get; set; } = "";
        public bool RememberMe { get; set; } = false;
        public string SavedUsername { get; set; } = "";
        public string SavedPassword { get; set; } = "";

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

            // 1. Try loading from local appsettings.json file
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
                config = new Config
                {
                    ServerUrl = "https://bas.dwatson.co",
                    SecretKey = "",
                    Branch = ""
                };
            }

            // 2. Allow Windows Environment Variables to override (Maximum Security)
            string envUrl = Environment.GetEnvironmentVariable("BAS_SERVER_URL");
            if (!string.IsNullOrWhiteSpace(envUrl)) config.ServerUrl = envUrl.Trim();

            string envKey = Environment.GetEnvironmentVariable("BAS_SECRET_KEY");
            if (!string.IsNullOrWhiteSpace(envKey)) config.SecretKey = envKey.Trim();

            string envBranch = Environment.GetEnvironmentVariable("BAS_BRANCH");
            if (!string.IsNullOrWhiteSpace(envBranch)) config.Branch = envBranch.Trim();

            // Auto-create file if it didn't exist
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
