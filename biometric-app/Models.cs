using System;
using System.Collections.Generic;

namespace BiometricApp
{
    public class LoginRequest
    {
        public string email { get; set; }
        public string password { get; set; }
    }

    public class LoginResponse
    {
        public bool success { get; set; }
        public string token { get; set; }
        public UserData user { get; set; }
        public string message { get; set; }
    }

    public class UserData
    {
        public string id { get; set; }
        public string name { get; set; }
        public string email { get; set; }
        public string role { get; set; }
        public object branch { get; set; }
    }

    public class StoreResponse
    {
        public bool success { get; set; }
        public List<Store> data { get; set; }
    }

    public class Store
    {
        public string _id { get; set; }
        public string name { get; set; }
    }

    public class EmployeeResponse
    {
        public bool success { get; set; }
        public List<Employee> data { get; set; }
    }

    public class Employee
    {
        public string _id { get; set; }
        public string code { get; set; }
        public string name { get; set; }
        public string branch { get; set; }
        public string? fingerprintTemplate { get; set; }
        public string? profilePicture { get; set; }
        public string? photo { get; set; }
        public bool hasFaceEnrolled { get; set; }
        public List<float>? faceTemplate { get; set; }
    }

    public class BiometricLogRequest
    {
        public string employeeCode { get; set; }
        public string type { get; set; } // IN or OUT
        public DateTime timestamp { get; set; }
        public string branch { get; set; }
        public string method { get; set; } = "FINGERPRINT"; // FINGERPRINT or FACE_AI
    }

    public class BiometricResponse
    {
        public bool success { get; set; }
        public string message { get; set; }
        public BiometricResponseData data { get; set; }
    }

    public class BiometricResponseData
    {
        public string employee { get; set; }
        public string code { get; set; }
        public string photo { get; set; }
        public string? checkIn { get; set; }
        public string? checkOut { get; set; }
        public string? action { get; set; } // IN or OUT
        public string? method { get; set; } // FINGERPRINT or FACE_AI
    }

    // 📸 Face AI Biometric DTOs
    public class FaceRegisterRequest
    {
        public string employeeId { get; set; }
        public string? employeeCode { get; set; }
        public List<float> template { get; set; }
        public string facePhotoBase64 { get; set; }
    }

    public class FaceDescriptorsResponse
    {
        public bool success { get; set; }
        public int count { get; set; }
        public List<FaceEmployeeDto> data { get; set; }
    }

    public class FaceEmployeeDto
    {
        public string id { get; set; } = string.Empty;
        public string _id { get => id; set => id = value; }
        public string code { get; set; } = string.Empty;
        public string name { get; set; } = string.Empty;
        public string branch { get; set; } = string.Empty;
        public string? photo { get; set; }
        public List<float>? faceTemplate { get; set; }
    }
}
