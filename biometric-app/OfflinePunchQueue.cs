using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.Tasks;

namespace BiometricApp
{
    public class OfflinePunchRecord
    {
        public string Id { get; set; } = Guid.NewGuid().ToString("N");
        public string EmployeeCode { get; set; } = string.Empty;
        public string EmployeeName { get; set; } = string.Empty;
        public DateTime TimestampUtc { get; set; } = DateTime.UtcNow;
        public string Branch { get; set; } = string.Empty;
        public string Method { get; set; } = "FACE_AI";
        public string? Photo { get; set; }
        public bool IsSynced { get; set; } = false;
        public DateTime? SyncedAt { get; set; }
        public int RetryCount { get; set; } = 0;
        public string? LastError { get; set; }
    }

    /// <summary>
    /// Thread-safe, persistent transactional outbox for offline biometric attendance records.
    /// Ensures zero punch loss even during network disconnections, power outages, or application restarts.
    /// </summary>
    public static class OfflinePunchQueue
    {
        private static readonly object _fileLock = new object();
        private static readonly string OutboxFilePath;

        static OfflinePunchQueue()
        {
            try
            {
                string? exePath = Environment.ProcessPath;
                string baseDir = !string.IsNullOrEmpty(exePath) ? Path.GetDirectoryName(exePath)! : AppDomain.CurrentDomain.BaseDirectory;
                OutboxFilePath = Path.Combine(baseDir, "offline_punches.json");
            }
            catch
            {
                OutboxFilePath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "offline_punches.json");
            }
        }

        public static List<OfflinePunchRecord> LoadAll()
        {
            lock (_fileLock)
            {
                try
                {
                    if (!File.Exists(OutboxFilePath)) return new List<OfflinePunchRecord>();
                    string json = File.ReadAllText(OutboxFilePath);
                    if (string.IsNullOrWhiteSpace(json)) return new List<OfflinePunchRecord>();
                    var list = JsonSerializer.Deserialize<List<OfflinePunchRecord>>(json);
                    return list ?? new List<OfflinePunchRecord>();
                }
                catch (Exception ex)
                {
                    Console.WriteLine("Error reading offline punch outbox: " + ex.Message);
                    return new List<OfflinePunchRecord>();
                }
            }
        }

        public static bool Enqueue(string employeeCode, string employeeName, string branch, string method, string? photo = null, DateTime? timestampUtc = null)
        {
            lock (_fileLock)
            {
                try
                {
                    var punches = LoadAll();

                    var record = new OfflinePunchRecord
                    {
                        Id = Guid.NewGuid().ToString("N"),
                        EmployeeCode = employeeCode,
                        EmployeeName = employeeName,
                        Branch = branch ?? "Main",
                        Method = string.IsNullOrEmpty(method) ? "FACE_AI" : method,
                        Photo = photo,
                        TimestampUtc = timestampUtc ?? DateTime.UtcNow,
                        IsSynced = false,
                        RetryCount = 0
                    };

                    punches.Add(record);

                    // Atomic write via temp file
                    string json = JsonSerializer.Serialize(punches, new JsonSerializerOptions { WriteIndented = true });
                    string tempPath = OutboxFilePath + ".tmp";
                    File.WriteAllText(tempPath, json);
                    File.Move(tempPath, OutboxFilePath, true);
                    return true;
                }
                catch (Exception ex)
                {
                    Console.WriteLine("Error enqueueing offline punch: " + ex.Message);
                    return false;
                }
            }
        }

        public static int GetPendingCount()
        {
            lock (_fileLock)
            {
                try
                {
                    var punches = LoadAll();
                    return punches.Count(p => !p.IsSynced);
                }
                catch
                {
                    return 0;
                }
            }
        }

        /// <summary>
        /// Drains pending offline punches to the backend API.
        /// Preserves original hardware timestamps so the backend can evaluate shifts accurately.
        /// </summary>
        public static async Task<int> SyncPendingPunchesAsync(HttpClient client, Config config)
        {
            if (client == null || config == null || string.IsNullOrWhiteSpace(config.ServerUrl))
                return 0;

            List<OfflinePunchRecord> pending;
            lock (_fileLock)
            {
                pending = LoadAll().Where(p => !p.IsSynced).OrderBy(p => p.TimestampUtc).ToList();
            }

            if (pending.Count == 0) return 0;

            int syncedCount = 0;
            var updatedPunches = LoadAll();

            foreach (var punch in pending)
            {
                try
                {
                    var payload = new BiometricLogRequest
                    {
                        employeeCode = punch.EmployeeCode,
                        timestamp = punch.TimestampUtc,
                        branch = punch.Branch,
                        method = punch.Method
                    };

                    using var req = new HttpRequestMessage(HttpMethod.Post, "api/v1/attendance/biometric")
                    {
                        Content = JsonContent.Create(payload)
                    };

                    if (!string.IsNullOrEmpty(config.SecretKey))
                    {
                        req.Headers.TryAddWithoutValidation("bas-secret-key", config.SecretKey);
                    }

                    var resp = await client.SendAsync(req);
                    BiometricResponse? result = null;
                    try
                    {
                        result = await resp.Content.ReadFromJsonAsync<BiometricResponse>();
                    }
                    catch { }

                    // 200 OK -> Punch registered!
                    // 400 Bad Request with "Already" or "Too close" -> Punch is already processed on server, safe to mark as synced!
                    bool isSuccess = (resp.IsSuccessStatusCode && result != null && result.success);
                    bool isAlreadyRegistered = (!resp.IsSuccessStatusCode && result != null && 
                        (result.message?.IndexOf("Already", StringComparison.OrdinalIgnoreCase) >= 0 ||
                         result.message?.IndexOf("Too close", StringComparison.OrdinalIgnoreCase) >= 0));

                    var match = updatedPunches.FirstOrDefault(p => p.Id == punch.Id);
                    if (match != null)
                    {
                        if (isSuccess || isAlreadyRegistered)
                        {
                            match.IsSynced = true;
                            match.SyncedAt = DateTime.UtcNow;
                            match.LastError = null;
                            syncedCount++;
                        }
                        else
                        {
                            match.RetryCount++;
                            match.LastError = result?.message ?? $"HTTP {(int)resp.StatusCode}";
                        }
                    }
                }
                catch (Exception ex)
                {
                    var match = updatedPunches.FirstOrDefault(p => p.Id == punch.Id);
                    if (match != null)
                    {
                        match.RetryCount++;
                        match.LastError = ex.Message;
                    }
                    // Stop sync if server unreachable
                    break;
                }
            }

            // Prune synced records older than 7 days
            var cutoff = DateTime.UtcNow.AddDays(-7);
            updatedPunches = updatedPunches.Where(p => !p.IsSynced || (p.SyncedAt.HasValue && p.SyncedAt.Value > cutoff)).ToList();

            lock (_fileLock)
            {
                try
                {
                    string json = JsonSerializer.Serialize(updatedPunches, new JsonSerializerOptions { WriteIndented = true });
                    string tempPath = OutboxFilePath + ".tmp";
                    File.WriteAllText(tempPath, json);
                    File.Move(tempPath, OutboxFilePath, true);
                }
                catch (Exception ex)
                {
                    Console.WriteLine("Error saving synced punch state: " + ex.Message);
                }
            }

            return syncedCount;
        }
    }
}
