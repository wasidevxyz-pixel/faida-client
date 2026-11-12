using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;

namespace BiometricApp
{
    public class LocalEnrolledFace
    {
        public string employeeId { get; set; } = string.Empty;
        public string employeeCode { get; set; } = string.Empty;
        public string name { get; set; } = string.Empty;
        public string branch { get; set; } = string.Empty;
        public string photoBase64 { get; set; } = string.Empty;
        public string frontPhotoBase64 { get; set; } = string.Empty;
        public string leftPhotoBase64 { get; set; } = string.Empty;
        public string rightPhotoBase64 { get; set; } = string.Empty;
        public bool livenessVerified { get; set; } = true;
        public List<float> faceTemplate { get; set; } = new List<float>();
        public string modelName { get; set; } = "SFace-128-v1";
        public int embeddingDimension { get; set; } = 128;
        public DateTime enrolledAt { get; set; } = DateTime.UtcNow;
        public bool isSyncedToCloud { get; set; } = false;
    }

    public static class LocalFaceStore
    {
        private static readonly object _fileLock = new object();
        private static readonly string DbFilePath;

        static LocalFaceStore()
        {
            try
            {
                string? exePath = Environment.ProcessPath;
                string baseDir = !string.IsNullOrEmpty(exePath) ? Path.GetDirectoryName(exePath)! : AppDomain.CurrentDomain.BaseDirectory;
                DbFilePath = Path.Combine(baseDir, "local_face_db.json");

                // Auto-Migration: If local_face_db.json not found in exe directory, search BaseDirectory and .net temp folders
                if (!File.Exists(DbFilePath))
                {
                    string altBase = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "local_face_db.json");
                    if (File.Exists(altBase))
                    {
                        File.Copy(altBase, DbFilePath, true);
                    }
                    else
                    {
                        try
                        {
                            string tempNet = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Temp", ".net", "BiometricApp");
                            if (Directory.Exists(tempNet))
                            {
                                var found = Directory.GetFiles(tempNet, "local_face_db.json", SearchOption.AllDirectories)
                                                     .OrderByDescending(f => new FileInfo(f).Length)
                                                     .FirstOrDefault();
                                if (found != null && File.Exists(found) && new FileInfo(found).Length > 10)
                                {
                                    File.Copy(found, DbFilePath, true);
                                }
                            }
                        }
                        catch { }
                    }
                }
            }
            catch
            {
                DbFilePath = "local_face_db.json";
            }

            try
            {
                // Purge accidental registration for Mudassir Siddique (3035)
                RemoveFaceByCode("3035");
            }
            catch { }
        }

        public static void SaveFace(string employeeCode, string name, List<float> faceTemplate, string? photoBase64 = null, string branch = "")
        {
            // Local file storage disabled: 100% of data is stored and fetched directly from MongoDB Database
        }

        public static void SaveFace(LocalEnrolledFace face)
        {
            // Local file storage disabled: 100% of data is stored and fetched directly from MongoDB Database
        }

        public static void RemoveFaceByCode(string employeeCode)
        {
            if (string.IsNullOrEmpty(employeeCode)) return;

            lock (_fileLock)
            {
                try
                {
                    var list = LoadAllInternal();
                    int removed = list.RemoveAll(f => string.Equals(f.employeeCode, employeeCode, StringComparison.OrdinalIgnoreCase));
                    if (removed > 0)
                    {
                        var options = new JsonSerializerOptions { WriteIndented = true };
                        File.WriteAllText(DbFilePath, JsonSerializer.Serialize(list, options));
                    }
                }
                catch { }
            }
        }

        public static void MarkSynced(string employeeCode)
        {
            if (string.IsNullOrEmpty(employeeCode)) return;

            lock (_fileLock)
            {
                try
                {
                    var list = LoadAllInternal();
                    var match = list.FirstOrDefault(f => f.employeeCode == employeeCode);
                    if (match != null)
                    {
                        match.isSyncedToCloud = true;
                        var options = new JsonSerializerOptions { WriteIndented = true };
                        File.WriteAllText(DbFilePath, JsonSerializer.Serialize(list, options));
                    }
                }
                catch { }
            }
        }

        public static List<LocalEnrolledFace> GetAll() => new List<LocalEnrolledFace>();

        public static List<FaceEmployeeDto> GetEnrolledFaceDtos() => new List<FaceEmployeeDto>();

        private static List<LocalEnrolledFace> LoadAllInternal() => new List<LocalEnrolledFace>();
    }
}
