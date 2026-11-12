using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using OpenCvSharp;
using OpenCvSharp.Extensions;
using OpenCvSharp.Dnn;

namespace BiometricApp
{
    public enum HeadPoseAngle
    {
        Unknown,
        Front,
        TurnLeft,
        TurnRight
    }

    public class FaceDetectionResult
    {
        public System.Drawing.Rectangle BoundingBox { get; set; }
        public float Confidence { get; set; }
        public bool IsLive { get; set; } = false;
        public float LivenessScore { get; set; } = 0.0f;
        public string SpoofWarning { get; set; } = string.Empty;
        public List<float> Embedding { get; set; } = new List<float>();
        public HeadPoseAngle PoseAngle { get; set; } = HeadPoseAngle.Front;
        public string PoseLabel { get; set; } = "Front";
        public float HorizontalCentroid { get; set; } = 0.5f;

        // YuNet 5-point facial landmarks and head pose estimation:
        public PointF[] Landmarks { get; set; } = new PointF[5];
        public bool HasLandmarks { get; set; } = false;
        public float YawDegrees { get; set; } = 0f;
        public float EyeDistance { get; set; } = 0f;
        public string DetectorType { get; set; } = "OpenCV YuNet CNN";

        // Verification & Recognition Status:
        public string DetectionStatus { get; set; } = "Detected"; // "Detected", "TrackingPredicted", "NoFace"
        public string RecognitionStatus { get; set; } = "None";   // "Success", "ExtractionFailed", "IncompatibleModel", "None"
        public string QualityStatus { get; set; } = "Good";       // "Good", "LowQuality", "Blurry"
        public bool IsRecognized => RecognitionStatus == "Success" && Embedding != null && Embedding.Count == 128;
    }

    public class LivenessCheckResult
    {
        public bool IsLive { get; set; } = false;
        public float Score { get; set; } = 0.0f;
        public string Warning { get; set; } = string.Empty;
    }

    public class FaceEngine : IDisposable
    {
        private CascadeClassifier? _faceCascade;
        private CascadeClassifier? _eyeCascade;
        private OpenCvSharp.Dnn.Net? _netYuNet;
        private OpenCvSharp.Dnn.Net? _netSFace;
        private bool _isYuNetActive = false;
        private bool _isSFaceActive = false;
        private readonly object _inferenceLock = new object();

        // Temporal tracking state
        private Rect _trackedFaceRect = new Rect();
        private int _missedFramesCount = 0;
        private const int MAX_MISSED_FRAMES = 5;

        // Unused EAR history kept for API compatibility
        private readonly Queue<float> _earHistory = new Queue<float>();

        public bool IsYuNetActive => _isYuNetActive;
        public bool IsSFaceActive => _isSFaceActive;

        public FaceEngine()
        {
            InitializeClassifiers();
        }

        private static string ResolveModelPath(string fileName)
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string p1 = Path.Combine(baseDir, "models", fileName);
            if (File.Exists(p1)) return p1;

            string p2 = Path.Combine(baseDir, fileName);
            if (File.Exists(p2)) return p2;

            string p3 = Path.Combine("models", fileName);
            if (File.Exists(p3)) return p3;

            try
            {
                string exeDir = Path.GetDirectoryName(Environment.ProcessPath) ?? string.Empty;
                if (!string.IsNullOrEmpty(exeDir))
                {
                    string p4 = Path.Combine(exeDir, "models", fileName);
                    if (File.Exists(p4)) return p4;
                    string p5 = Path.Combine(exeDir, fileName);
                    if (File.Exists(p5)) return p5;
                }
            }
            catch { }

            try
            {
                string tempNet = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Temp", ".net", "BiometricApp");
                if (Directory.Exists(tempNet))
                {
                    var found = Directory.GetFiles(tempNet, fileName, SearchOption.AllDirectories).FirstOrDefault();
                    if (found != null && File.Exists(found)) return found;
                }
            }
            catch { }

            return p1;
        }

        private void InitializeClassifiers()
        {
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;

                // 1. Initialize OpenCV YuNet 5-Landmark Face Detector
                string yunetPath = ResolveModelPath("face_detection_yunet_2023mar.onnx");
                if (File.Exists(yunetPath))
                {
                    try
                    {
                        _netYuNet = CvDnn.ReadNetFromOnnx(yunetPath);
                        _isYuNetActive = (_netYuNet != null && !_netYuNet.Empty());
                        if (_isYuNetActive) Console.WriteLine($"[FaceEngine] Loaded YuNet ONNX detector from: {yunetPath}");
                    }
                    catch (Exception exY)
                    {
                        Console.WriteLine("[FaceEngine] YuNet load error: " + exY.Message);
                    }
                }
                else
                {
                    Console.WriteLine("[FaceEngine] YuNet model file not found at: " + yunetPath);
                }

                // 2. Initialize OpenCV SFace Deep Face Recognizer
                string sfacePath = ResolveModelPath("face_recognition_sface_2021dec.onnx");
                if (File.Exists(sfacePath))
                {
                    try
                    {
                        _netSFace = CvDnn.ReadNetFromOnnx(sfacePath);
                        _isSFaceActive = (_netSFace != null && !_netSFace.Empty());
                        if (_isSFaceActive) Console.WriteLine($"[FaceEngine] Loaded SFace ONNX recognizer from: {sfacePath}");
                    }
                    catch (Exception exS)
                    {
                        Console.WriteLine("[FaceEngine] SFace load error: " + exS.Message);
                    }
                }
                else
                {
                    Console.WriteLine("[FaceEngine] SFace model file not found at: " + sfacePath);
                }

                // 3. Fallback Haar Cascades (if ONNX models absent)
                string haarcascadeFace = Path.Combine(baseDir, "haarcascade_frontalface_default.xml");
                if (!File.Exists(haarcascadeFace)) haarcascadeFace = "haarcascade_frontalface_default.xml";

                string haarcascadeEye = Path.Combine(baseDir, "haarcascade_eye.xml");
                if (!File.Exists(haarcascadeEye)) haarcascadeEye = "haarcascade_eye.xml";

                if (File.Exists(haarcascadeFace))
                {
                    _faceCascade = new CascadeClassifier(haarcascadeFace);
                }
                if (File.Exists(haarcascadeEye))
                {
                    _eyeCascade = new CascadeClassifier(haarcascadeEye);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("Cascade initialization warning: " + ex.Message);
            }
        }

        public void ResetTracking()
        {
            lock (_inferenceLock)
            {
                _trackedFaceRect = new Rect();
                _missedFramesCount = 0;
                _earHistory.Clear();
            }
        }

        public List<FaceDetectionResult> ProcessFrame(Bitmap frameBitmap)
        {
            var results = new List<FaceDetectionResult>();
            if (frameBitmap == null) return results;

            lock (_inferenceLock)
            {
                try
                {
                    using var mat = BitmapConverter.ToMat(frameBitmap);
                    if (mat.Empty()) return results;

                    // 1. Primary Deep Pipeline: OpenCV YuNet (5-Landmarks + Aspect-Ratio Letterbox)
                    if (_isYuNetActive && _netYuNet != null && !_netYuNet.Empty())
                    {
                        var yunetResult = DetectFaceYuNet(mat);
                        if (yunetResult != null)
                        {
                            // If this was a temporal hold/predicted box without landmarks, DO NOT extract features!
                            if (yunetResult.DetectionStatus == "TrackingPredicted" || !yunetResult.HasLandmarks)
                            {
                                yunetResult.RecognitionStatus = "StaleBoxSkipped";
                                yunetResult.Embedding = new List<float>();
                                results.Add(yunetResult);
                                return results;
                            }

                            // Extract SFace 128-dim deep embedding
                            if (_isSFaceActive && _netSFace != null && !_netSFace.Empty())
                            {
                                var emb = ExtractSFaceEmbedding(mat, yunetResult.Landmarks);
                                if (emb != null && emb.Count == 128)
                                {
                                    yunetResult.Embedding = emb;
                                    yunetResult.RecognitionStatus = "Success";
                                }
                                else
                                {
                                    yunetResult.Embedding = new List<float>();
                                    yunetResult.RecognitionStatus = "ExtractionFailed";
                                }
                            }
                            else
                            {
                                yunetResult.Embedding = new List<float>();
                                yunetResult.RecognitionStatus = "ModelInactive";
                            }

                            results.Add(yunetResult);
                            return results;
                        }
                    }

                    // 2. Secondary Fallback Pipeline: Haar Cascade (Used ONLY if YuNet ONNX model is missing)
                    if (_faceCascade != null && !_faceCascade.Empty())
                    {
                        using var gray = new Mat();
                        Cv2.CvtColor(mat, gray, ColorConversionCodes.BGR2GRAY);
                        Cv2.EqualizeHist(gray, gray);

                        int targetWidth = 400;
                        double scale = (double)targetWidth / Math.Max(1, mat.Width);
                        int targetHeight = (int)(mat.Height * scale);

                        using var smallGray = new Mat();
                        Cv2.Resize(gray, smallGray, new OpenCvSharp.Size(targetWidth, targetHeight));

                        var rawFaces = _faceCascade.DetectMultiScale(
                            smallGray,
                            scaleFactor: 1.10,
                            minNeighbors: 4,
                            flags: HaarDetectionTypes.ScaleImage,
                            minSize: new OpenCvSharp.Size(35, 35)
                        );

                        Rect candidateSmall = new Rect();
                        double bestScore = -1;

                        if (rawFaces != null && rawFaces.Length > 0)
                        {
                            double frameCenterX = smallGray.Width / 2.0;
                            double frameCenterY = smallGray.Height / 2.0;

                            foreach (var f in rawFaces)
                            {
                                double aspect = f.Height / (double)f.Width;
                                if (aspect < 0.70 || aspect > 1.65) continue;

                                double cx = f.X + f.Width / 2.0;
                                double cy = f.Y + f.Height / 2.0;
                                double normDistX = Math.Abs(cx - frameCenterX) / frameCenterX;
                                double normDistY = Math.Abs(cy - frameCenterY) / frameCenterY;
                                double distFromCenter = Math.Sqrt(normDistX * normDistX + normDistY * normDistY);

                                if (distFromCenter > 0.85) continue;

                                double area = f.Width * f.Height;
                                double centerBonus = 1.0 / (1.0 + (distFromCenter * 3.0));
                                double score = area * centerBonus;

                                if (score > bestScore)
                                {
                                    bestScore = score;
                                    candidateSmall = f;
                                }
                            }
                        }

                        if (candidateSmall.Width > 0)
                        {
                            double invScale = 1.0 / scale;
                            Rect detectedFull = new Rect(
                                (int)(candidateSmall.X * invScale),
                                (int)(candidateSmall.Y * invScale),
                                (int)(candidateSmall.Width * invScale),
                                (int)(candidateSmall.Height * invScale)
                            );
                            detectedFull = detectedFull.Intersect(new Rect(0, 0, mat.Width, mat.Height));

                            var liveness = CheckLiveness(mat, detectedFull);
                            var (pose, centroid, poseLabel) = DetectHeadPose(gray, detectedFull);

                            // Legacy 512-D fallback marked explicitly as non-SFace
                            var fallbackEmb = ExtractFeatureVector(mat, detectedFull);

                            results.Add(new FaceDetectionResult
                            {
                                BoundingBox = new System.Drawing.Rectangle(detectedFull.X, detectedFull.Y, detectedFull.Width, detectedFull.Height),
                                Confidence = 0.85f,
                                IsLive = liveness.IsLive,
                                LivenessScore = liveness.Score,
                                SpoofWarning = liveness.Warning,
                                Embedding = fallbackEmb,
                                PoseAngle = pose,
                                PoseLabel = poseLabel,
                                HorizontalCentroid = centroid,
                                DetectorType = "Haar Cascade (Legacy Fallback)",
                                DetectionStatus = "Detected",
                                RecognitionStatus = "HandcraftedLegacy",
                                HasLandmarks = false
                            });
                        }
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine("Face processing error: " + ex.Message);
                }
            }

            return results;
        }

        /// <summary>
        /// Letterbox preprocessing preserves the webcam's native aspect ratio (e.g. 16:9, 4:3)
        /// by scaling uniformly and padding borders, eliminating squishing distortion.
        /// </summary>
        private static (Mat paddedMat, float scale, int padLeft, int padTop) LetterboxImage(Mat src, int targetW = 640, int targetH = 640)
        {
            float scale = Math.Min((float)targetW / src.Width, (float)targetH / src.Height);
            int scaledW = (int)Math.Round(src.Width * scale);
            int scaledH = (int)Math.Round(src.Height * scale);

            int padLeft = (targetW - scaledW) / 2;
            int padTop = (targetH - scaledH) / 2;

            var padded = new Mat(targetH, targetW, MatType.CV_8UC3, new Scalar(114, 114, 114));
            using var resized = new Mat();
            Cv2.Resize(src, resized, new OpenCvSharp.Size(scaledW, scaledH));

            var roi = new Rect(padLeft, padTop, scaledW, scaledH);
            using var destRoi = new Mat(padded, roi);
            resized.CopyTo(destRoi);

            return (padded, scale, padLeft, padTop);
        }

        /// <summary>
        /// Decodes YuNet multi-scale raw output tensors across strides 8, 16, 32.
        /// Uses verified OpenCV face_detect.cpp mathematical decoding formulas.
        /// </summary>
        private static List<(Rect2d bbox, Point2f[] landmarks, float score, double centerDist)> DecodeYuNetBlobs(
            Mat[] outBlobs, int targetW, int targetH, float confThreshold = 0.40f)
        {
            var candidates = new List<(Rect2d bbox, Point2f[] landmarks, float score, double centerDist)>();
            int[] strides = new int[] { 8, 16, 32 };

            for (int sIdx = 0; sIdx < strides.Length; sIdx++)
            {
                int stride = strides[sIdx];
                int cols = targetW / stride;
                int rows = targetH / stride;

                var cls = outBlobs[sIdx];
                var obj = outBlobs[sIdx + 3];
                var bbox = outBlobs[sIdx + 6];
                var kps = outBlobs[sIdx + 9];

                if (cls.Empty() || obj.Empty() || bbox.Empty() || kps.Empty() ||
                    cls.Data == IntPtr.Zero || obj.Data == IntPtr.Zero || bbox.Data == IntPtr.Zero || kps.Data == IntPtr.Zero)
                {
                    continue;
                }

                unsafe
                {
                    float* cls_v = (float*)cls.Data;
                    float* obj_v = (float*)obj.Data;
                    float* bbox_v = (float*)bbox.Data;
                    float* kps_v = (float*)kps.Data;

                    for (int r = 0; r < rows; ++r)
                    {
                        for (int c = 0; c < cols; ++c)
                        {
                            int idx = r * cols + c;
                            float cls_score = Math.Clamp(cls_v[idx], 0f, 1f);
                            float obj_score = Math.Clamp(obj_v[idx], 0f, 1f);
                            float score = (float)Math.Sqrt(cls_score * obj_score);

                            if (score < confThreshold) continue;

                            // Verified YuNet anchor-offset decoding formula (from OpenCV face_detect.cpp)
                            float cx = (c + bbox_v[idx * 4 + 0]) * stride;
                            float cy = (r + bbox_v[idx * 4 + 1]) * stride;
                            float w = (float)Math.Exp(bbox_v[idx * 4 + 2]) * stride;
                            float h = (float)Math.Exp(bbox_v[idx * 4 + 3]) * stride;

                            float aspect = h / Math.Max(1f, w);
                            if (aspect < 0.65f || aspect > 1.70f) continue;

                            double normDistX = Math.Abs(cx - (targetW / 2.0)) / (targetW / 2.0);
                            double normDistY = Math.Abs(cy - (targetH / 2.0)) / (targetH / 2.0);
                            double centerDist = Math.Sqrt(normDistX * normDistX + normDistY * normDistY);
                            if (centerDist > 0.92) continue;

                            float x1 = cx - w / 2f;
                            float y1 = cy - h / 2f;

                            var lms = new Point2f[5];
                            for (int n = 0; n < 5; ++n)
                            {
                                lms[n] = new Point2f(
                                    (kps_v[idx * 10 + 2 * n + 0] + c) * stride,
                                    (kps_v[idx * 10 + 2 * n + 1] + r) * stride
                                );
                            }

                            candidates.Add((new Rect2d(x1, y1, w, h), lms, score, centerDist));
                        }
                    }
                }
            }

            return candidates;
        }

        public FaceDetectionResult? DetectFaceYuNet(Mat mat)
        {
            if (_netYuNet == null || _netYuNet.Empty() || mat == null || mat.Empty()) return null;

            int targetW = 640;
            int targetH = 640;

            // Apply aspect-ratio letterboxing to avoid image squishing
            var (paddedMat, scale, padLeft, padTop) = LetterboxImage(mat, targetW, targetH);
            using (paddedMat)
            using (var blob = CvDnn.BlobFromImage(paddedMat, 1.0, new OpenCvSharp.Size(targetW, targetH), new Scalar(0, 0, 0), false, false))
            {
                _netYuNet.SetInput(blob);

                string[] outNames = new string[] {
                    "cls_8", "cls_16", "cls_32",
                    "obj_8", "obj_16", "obj_32",
                    "bbox_8", "bbox_16", "bbox_32",
                    "kps_8", "kps_16", "kps_32"
                };

                var outBlobs = new Mat[outNames.Length];
                for (int i = 0; i < outNames.Length; i++) outBlobs[i] = new Mat();

                try
                {
                    _netYuNet.Forward(outBlobs, outNames);
                    var candidates = DecodeYuNetBlobs(outBlobs, targetW, targetH, 0.40f);

                    if (candidates.Count == 0)
                    {
                        if (_trackedFaceRect.Width > 0 && _missedFramesCount < MAX_MISSED_FRAMES)
                        {
                            _missedFramesCount++;
                            return new FaceDetectionResult
                            {
                                BoundingBox = new System.Drawing.Rectangle(_trackedFaceRect.X, _trackedFaceRect.Y, _trackedFaceRect.Width, _trackedFaceRect.Height),
                                Confidence = 0.50f,
                                PoseAngle = HeadPoseAngle.Front,
                                PoseLabel = "Tracking Hold",
                                DetectorType = "YuNet (Temporal Hold)",
                                DetectionStatus = "TrackingPredicted",
                                HasLandmarks = false,
                                RecognitionStatus = "None"
                            };
                        }
                        return null;
                    }

                    // Map decoded candidates from 640x640 padded coordinates back to original frame coordinates
                    var mappedBoxes = new List<Rect>();
                    var mappedScores = new List<float>();
                    var validCandidates = new List<(Rect2d bbox, Point2f[] landmarks, float score, double centerDist)>();

                    foreach (var cand in candidates)
                    {
                        float origCx = ((float)cand.bbox.X + (float)cand.bbox.Width / 2f - padLeft) / scale;
                        float origCy = ((float)cand.bbox.Y + (float)cand.bbox.Height / 2f - padTop) / scale;
                        float origW = (float)cand.bbox.Width / scale;
                        float origH = (float)cand.bbox.Height / scale;
                        float origX1 = origCx - origW / 2f;
                        float origY1 = origCy - origH / 2f;

                        int clampedX = Math.Max(0, (int)origX1);
                        int clampedY = Math.Max(0, (int)origY1);
                        int clampedW = Math.Min(mat.Width - clampedX, (int)origW);
                        int clampedH = Math.Min(mat.Height - clampedY, (int)origH);

                        if (clampedW > 15 && clampedH > 15)
                        {
                            mappedBoxes.Add(new Rect(clampedX, clampedY, clampedW, clampedH));
                            mappedScores.Add(cand.score);
                            validCandidates.Add(cand);
                        }
                    }

                    if (mappedBoxes.Count == 0) return null;

                    CvDnn.NMSBoxes(mappedBoxes.ToArray(), mappedScores.ToArray(), 0.40f, 0.35f, out int[] indices);
                    if (indices.Length == 0) return null;

                    // Select best candidate based on score and central proximity
                    int bestIdx = indices[0];
                    double bestMetric = -1;

                    foreach (int idx in indices)
                    {
                        var cand = validCandidates[idx];
                        double metric = cand.score * (1.0 / (1.0 + cand.centerDist * 2.0));

                        if (_trackedFaceRect.Width > 0 && _missedFramesCount < MAX_MISSED_FRAMES)
                        {
                            var box = mappedBoxes[idx];
                            double distTrack = Math.Sqrt(Math.Pow(box.X - _trackedFaceRect.X, 2) + Math.Pow(box.Y - _trackedFaceRect.Y, 2));
                            metric *= (1.0 / (1.0 + distTrack / 200.0));
                        }

                        if (metric > bestMetric)
                        {
                            bestMetric = metric;
                            bestIdx = idx;
                        }
                    }

                    var selectedBox = mappedBoxes[bestIdx];
                    var selectedCand = validCandidates[bestIdx];

                    // Smooth tracking
                    Rect finalRect;
                    if (_trackedFaceRect.Width > 0 && _missedFramesCount < MAX_MISSED_FRAMES)
                    {
                        finalRect = new Rect(
                            (int)(_trackedFaceRect.X * 0.25 + selectedBox.X * 0.75),
                            (int)(_trackedFaceRect.Y * 0.25 + selectedBox.Y * 0.75),
                            (int)(_trackedFaceRect.Width * 0.25 + selectedBox.Width * 0.75),
                            (int)(_trackedFaceRect.Height * 0.25 + selectedBox.Height * 0.75)
                        );
                    }
                    else
                    {
                        finalRect = selectedBox;
                    }

                    finalRect = finalRect.Intersect(new Rect(0, 0, mat.Width, mat.Height));
                    _trackedFaceRect = finalRect;
                    _missedFramesCount = 0;

                    // Map 5 landmarks back to original frame space
                    var landmarks = new PointF[5];
                    for (int i = 0; i < 5; i++)
                    {
                        float origPx = Math.Clamp((selectedCand.landmarks[i].X - padLeft) / scale, 0f, mat.Width - 1);
                        float origPy = Math.Clamp((selectedCand.landmarks[i].Y - padTop) / scale, 0f, mat.Height - 1);
                        landmarks[i] = new PointF(origPx, origPy);
                    }

                    // Yaw angle estimation from 5 landmarks (Right Eye, Left Eye, Nose, Right Mouth, Left Mouth)
                    float eyeDist = (float)Math.Sqrt(Math.Pow(landmarks[1].X - landmarks[0].X, 2) + Math.Pow(landmarks[1].Y - landmarks[0].Y, 2));
                    float noseDev = landmarks[2].X - landmarks[0].X;
                    float symmetry = eyeDist > 0 ? (noseDev / eyeDist) : 0.5f;

                    float mouthDist = Math.Abs(landmarks[4].X - landmarks[3].X);
                    if (mouthDist > 5f)
                    {
                        float mouthSym = (landmarks[2].X - landmarks[3].X) / mouthDist;
                        symmetry = (symmetry * 0.70f) + (mouthSym * 0.30f);
                    }

                    float yawDegrees = (symmetry - 0.50f) * 90.0f;
                    HeadPoseAngle poseAngle;
                    string poseLabel;

                    if (yawDegrees > 12.0f)
                    {
                        poseAngle = HeadPoseAngle.TurnLeft;
                        poseLabel = $"Turned Left ({yawDegrees:F1}°)";
                    }
                    else if (yawDegrees < -12.0f)
                    {
                        poseAngle = HeadPoseAngle.TurnRight;
                        poseLabel = $"Turned Right ({yawDegrees:F1}°)";
                    }
                    else
                    {
                        poseAngle = HeadPoseAngle.Front;
                        poseLabel = $"Front Center ({yawDegrees:F1}°)";
                    }

                    var liveness = CheckLiveness(mat, finalRect);

                    return new FaceDetectionResult
                    {
                        BoundingBox = new System.Drawing.Rectangle(finalRect.X, finalRect.Y, finalRect.Width, finalRect.Height),
                        Confidence = selectedCand.score,
                        IsLive = liveness.IsLive,
                        LivenessScore = liveness.Score,
                        SpoofWarning = liveness.Warning,
                        PoseAngle = poseAngle,
                        PoseLabel = poseLabel,
                        HorizontalCentroid = symmetry,
                        Landmarks = landmarks,
                        HasLandmarks = true,
                        YawDegrees = yawDegrees,
                        EyeDistance = eyeDist,
                        DetectorType = "OpenCV YuNet CNN",
                        DetectionStatus = "Detected"
                    };
                }
                finally
                {
                    for (int i = 0; i < outBlobs.Length; i++) outBlobs[i].Dispose();
                }
            }
        }

        public List<float> ExtractSFaceEmbedding(Mat frame, PointF[] landmarks)
        {
            if (_netSFace == null || _netSFace.Empty() || landmarks == null || landmarks.Length < 5)
                return new List<float>();

            try
            {
                // Validate landmarks: must be non-NaN, non-Inf, and within reasonable distance
                if (landmarks.Any(pt => float.IsNaN(pt.X) || float.IsInfinity(pt.X) || float.IsNaN(pt.Y) || float.IsInfinity(pt.Y)))
                    return new List<float>();

                float eyeDist = (float)Math.Sqrt(Math.Pow(landmarks[1].X - landmarks[0].X, 2) + Math.Pow(landmarks[1].Y - landmarks[0].Y, 2));
                if (eyeDist < 8.0f) return new List<float>();

                var srcPoints = landmarks.Select(pt => new Point2f(pt.X, pt.Y)).ToArray();

                // Canonical SFace destination 112x112 coordinates:
                // 0: Right Eye, 1: Left Eye, 2: Nose, 3: Right Mouth, 4: Left Mouth
                var dstPoints = new Point2f[] {
                    new Point2f(38.2946f, 51.6963f),
                    new Point2f(73.5318f, 51.5014f),
                    new Point2f(56.0252f, 71.7366f),
                    new Point2f(41.5493f, 92.3655f),
                    new Point2f(70.7299f, 92.2041f)
                };

                using var warpMat = Cv2.EstimateAffinePartial2D(InputArray.Create(srcPoints), InputArray.Create(dstPoints));
                if (warpMat == null || warpMat.Empty() || warpMat.Rows != 2 || warpMat.Cols != 3)
                    return new List<float>();

                using var alignedFace = new Mat();
                Cv2.WarpAffine(frame, alignedFace, warpMat, new OpenCvSharp.Size(112, 112));
                if (alignedFace.Empty() || alignedFace.Width != 112 || alignedFace.Height != 112)
                    return new List<float>();

                using var blobFace = CvDnn.BlobFromImage(alignedFace, 1.0, new OpenCvSharp.Size(112, 112), new Scalar(0, 0, 0), true, false);
                _netSFace.SetInput(blobFace);

                using var feat = _netSFace.Forward();
                if (feat == null || feat.Empty() || feat.Data == IntPtr.Zero || feat.Total() < 128)
                {
                    return new List<float>();
                }

                float[] emb = new float[128];
                unsafe
                {
                    float* fptr = (float*)feat.Data;
                    for (int e = 0; e < 128; e++) emb[e] = fptr[e];
                }

                // Check for NaN or Inf
                if (emb.Any(v => float.IsNaN(v) || float.IsInfinity(v)))
                    return new List<float>();

                // L2 normalize
                double sumSq = 0.0;
                for (int e = 0; e < 128; e++) sumSq += emb[e] * emb[e];
                float norm = (float)Math.Sqrt(sumSq);

                if (norm < 1e-4f) return new List<float>();

                for (int e = 0; e < 128; e++) emb[e] /= norm;

                return emb.ToList();
            }
            catch (Exception ex)
            {
                Console.WriteLine("[FaceEngine] SFace embedding extraction error: " + ex.Message);
                return new List<float>();
            }
        }

        public (HeadPoseAngle pose, float centroid, string label) DetectHeadPose(Mat fullGray, Rect faceRect)
        {
            try
            {
                faceRect = faceRect.Intersect(new Rect(0, 0, fullGray.Width, fullGray.Height));
                if (faceRect.Width < 20 || faceRect.Height < 20)
                    return (HeadPoseAngle.Front, 0.5f, "Front");

                using var faceCrop = new Mat(fullGray, faceRect);
                using var gradX = new Mat();
                Cv2.Sobel(faceCrop, gradX, MatType.CV_16S, 1, 0, 3);
                using var absGradX = new Mat();
                Cv2.ConvertScaleAbs(gradX, absGradX);

                double totalWeight = 0;
                double weightedX = 0;
                int stepRow = Math.Max(1, absGradX.Rows / 25);
                int stepCol = Math.Max(1, absGradX.Cols / 25);

                for (int r = 0; r < absGradX.Rows; r += stepRow)
                {
                    for (int c = 0; c < absGradX.Cols; c += stepCol)
                    {
                        byte val = absGradX.At<byte>(r, c);
                        if (val > 15)
                        {
                            totalWeight += val;
                            weightedX += c * val;
                        }
                    }
                }

                float centroid = totalWeight > 0 ? (float)(weightedX / (totalWeight * absGradX.Cols)) : 0.5f;

                if (centroid > 0.55f)
                {
                    return (HeadPoseAngle.TurnLeft, centroid, "Turned Left");
                }
                else if (centroid < 0.45f)
                {
                    return (HeadPoseAngle.TurnRight, centroid, "Turned Right");
                }
                else
                {
                    return (HeadPoseAngle.Front, centroid, "Front Center");
                }
            }
            catch
            {
                return (HeadPoseAngle.Front, 0.5f, "Front");
            }
        }

        /// <summary>
        /// Heuristic Quality and Spoof-Risk Check:
        /// Evaluates edge sharpness (Laplacian variance), high-frequency moiré, and digital screen color reflection.
        /// Fails CLOSED on exceptions or suspicious texture/reflection patterns.
        /// </summary>
        public LivenessCheckResult CheckLiveness(Mat frame, Rect faceRect)
        {
            try
            {
                faceRect = faceRect.Intersect(new Rect(0, 0, frame.Width, frame.Height));
                if (faceRect.Width <= 15 || faceRect.Height <= 15)
                {
                    return new LivenessCheckResult { IsLive = false, Score = 0.0f, Warning = "Face out of bounds" };
                }

                using var faceMat = new Mat(frame, faceRect);
                using var grayFace = new Mat();
                Cv2.CvtColor(faceMat, grayFace, ColorConversionCodes.BGR2GRAY);

                // 1. Texture Sharpness & Flatness (Laplacian Edge Variance)
                double variance = 0.0;
                using (var laplacian = new Mat())
                {
                    Cv2.Laplacian(grayFace, laplacian, MatType.CV_64F);
                    Cv2.MeanStdDev(laplacian, out Scalar mean, out Scalar stddev);
                    variance = stddev.Val0 * stddev.Val0;

                    // Unnaturally flat surface (e.g., printed paper photo)
                    if (variance < 35.0)
                    {
                        return new LivenessCheckResult
                        {
                            IsLive = false,
                            Score = 0.20f,
                            Warning = "FLAT SURFACE DETECTED (PRINTED PHOTO REJECTED)"
                        };
                    }

                    // Extreme moiré noise (e.g. low-res CRT or dense display subpixels)
                    if (variance > 2500.0)
                    {
                        return new LivenessCheckResult
                        {
                            IsLive = false,
                            Score = 0.25f,
                            Warning = "HIGH-FREQUENCY NOISE DETECTED (DISPLAY REJECTED)"
                        };
                    }
                }

                // 2. High-Frequency Screen Reflection / Color Saturation Check
                Scalar meanColor = Cv2.Mean(faceMat);
                double blue = meanColor.Val0;
                double red = meanColor.Val2;

                if (blue > red && blue > 140)
                {
                    return new LivenessCheckResult
                    {
                        IsLive = false,
                        Score = 0.30f,
                        Warning = "DIGITAL SCREEN REFLECTION DETECTED"
                    };
                }

                // Measured quality confidence score (calibrated, honest score)
                float qualityScore = Math.Clamp((float)(variance / 350.0), 0.50f, 0.90f);

                return new LivenessCheckResult
                {
                    IsLive = true,
                    Score = qualityScore,
                    Warning = string.Empty
                };
            }
            catch (Exception ex)
            {
                // FAIL-CLOSED for security: An exception must never authenticate attendance!
                return new LivenessCheckResult
                {
                    IsLive = false,
                    Score = 0.0f,
                    Warning = "Quality check failed: " + ex.Message
                };
            }
        }

        /// <summary>
        /// Handcrafted 512-dim descriptor (Legacy fallback when ONNX neural networks are unavailable).
        /// Note: This is an experimental handcrafted vector and must never be matched against SFace.
        /// </summary>
        public List<float> ExtractFeatureVector(Mat frame, Rect faceRect)
        {
            var vector = new float[512];

            try
            {
                faceRect = faceRect.Intersect(new Rect(0, 0, frame.Width, frame.Height));
                if (faceRect.Width < 10 || faceRect.Height < 10) return new List<float>();

                using var faceCrop = new Mat(frame, faceRect);
                using var resized = new Mat();
                using var gray = new Mat();

                Cv2.Resize(faceCrop, resized, new OpenCvSharp.Size(112, 112));
                Cv2.CvtColor(resized, gray, ColorConversionCodes.BGR2GRAY);
                Cv2.EqualizeHist(gray, gray);

                using var sobelX = new Mat();
                using var sobelY = new Mat();
                Cv2.Sobel(gray, sobelX, MatType.CV_32F, 1, 0, 3);
                Cv2.Sobel(gray, sobelY, MatType.CV_32F, 0, 1, 3);

                int idx = 0;
                int step = 112 / 8;

                for (int y = 0; y < 8 && idx < 512; y++)
                {
                    for (int x = 0; x < 8 && idx < 512; x++)
                    {
                        var patchRect = new Rect(x * step, y * step, step, step);
                        using var patchGray = new Mat(gray, patchRect);
                        using var patchSobX = new Mat(sobelX, patchRect);
                        using var patchSobY = new Mat(sobelY, patchRect);

                        Cv2.MeanStdDev(patchGray, out Scalar mGray, out Scalar sGray);
                        Cv2.MeanStdDev(patchSobX, out Scalar mSobX, out Scalar sSobX);
                        Cv2.MeanStdDev(patchSobY, out Scalar mSobY, out Scalar sSobY);

                        if (idx < 512) vector[idx++] = (float)mGray.Val0;
                        if (idx < 512) vector[idx++] = (float)sGray.Val0;
                        if (idx < 512) vector[idx++] = (float)mSobX.Val0;
                        if (idx < 512) vector[idx++] = (float)sSobX.Val0;
                        if (idx < 512) vector[idx++] = (float)mSobY.Val0;
                        if (idx < 512) vector[idx++] = (float)sSobY.Val0;
                    }
                }

                double sum = 0.0;
                for (int i = 0; i < 512; i++) sum += vector[i];
                float mean = (float)(sum / 512.0);

                double sumSquares = 0.0;
                for (int i = 0; i < 512; i++)
                {
                    vector[i] -= mean;
                    sumSquares += vector[i] * vector[i];
                }

                float norm = (float)Math.Sqrt(sumSquares);
                if (norm > 0.0001f)
                {
                    for (int i = 0; i < 512; i++) vector[i] /= norm;
                }
            }
            catch
            {
                return new List<float>();
            }

            return vector.ToList();
        }

        /// <summary>
        /// Computes Cosine Similarity between two face embeddings.
        /// Strictly validates vector dimensions, rejecting mismatched or non-finite vectors.
        /// </summary>
        public static float ComputeCosineSimilarity(List<float> vectorA, List<float> vectorB)
        {
            if (vectorA == null || vectorB == null || vectorA.Count == 0 || vectorB.Count == 0)
                return 0f;

            // Reject mismatched dimensions (e.g. 128-D SFace vs 512-D handcrafted fallback)
            if (vectorA.Count != vectorB.Count)
                return 0f;

            // SFace 128-D normalized deep embedding
            if (vectorA.Count == 128)
            {
                float dot = 0f;
                float normA = 0f;
                float normB = 0f;

                for (int i = 0; i < 128; i++)
                {
                    float a = vectorA[i];
                    float b = vectorB[i];

                    if (float.IsNaN(a) || float.IsInfinity(a) || float.IsNaN(b) || float.IsInfinity(b))
                        return 0f;

                    dot += a * b;
                    normA += a * a;
                    normB += b * b;
                }

                if (normA <= 1e-7f || normB <= 1e-7f) return 0f;
                float sim = dot / ((float)Math.Sqrt(normA) * (float)Math.Sqrt(normB));
                return Math.Clamp(sim, 0f, 1f);
            }

            // Fallback for identical non-128 length vectors (e.g. legacy 512-D vs 512-D)
            int len = vectorA.Count;
            float cDot = 0f, cNormA = 0f, cNormB = 0f;
            for (int i = 0; i < len; i++)
            {
                float a = vectorA[i];
                float b = vectorB[i];
                cDot += a * b;
                cNormA += a * a;
                cNormB += b * b;
            }

            if (cNormA <= 1e-7f || cNormB <= 1e-7f) return 0f;
            return Math.Clamp(cDot / ((float)Math.Sqrt(cNormA) * (float)Math.Sqrt(cNormB)), 0f, 1f);
        }

        /// <summary>
        /// Merges multiple angle embeddings (Front, Left, Right) into a robust composite master vector.
        /// Validates dimension consistency and normalizes properly.
        /// </summary>
        public static List<float> MergeAngleEmbeddings(List<List<float>> angleVectors)
        {
            if (angleVectors == null || angleVectors.Count == 0) return new List<float>();

            // Filter valid 128-D vectors
            var valid = angleVectors.Where(v => v != null && v.Count == 128 && !v.Any(float.IsNaN) && !v.Any(float.IsInfinity)).ToList();
            if (valid.Count == 0) return new List<float>();
            if (valid.Count == 1) return new List<float>(valid[0]);

            float[] composite = new float[128];
            foreach (var vec in valid)
            {
                for (int i = 0; i < 128; i++) composite[i] += vec[i];
            }

            float count = valid.Count;
            double sumSquares = 0.0;
            for (int i = 0; i < 128; i++)
            {
                composite[i] /= count;
                sumSquares += composite[i] * composite[i];
            }

            float norm = (float)Math.Sqrt(sumSquares);
            if (norm > 1e-5f)
            {
                for (int i = 0; i < 128; i++) composite[i] /= norm;
            }
            else
            {
                return new List<float>();
            }

            return composite.ToList();
        }

        public static Bitmap ExtractFaceCrop(Bitmap sourceFrame, System.Drawing.Rectangle faceBox, float paddingFactor = 0.22f)
        {
            if (sourceFrame == null || faceBox.Width <= 10 || faceBox.Height <= 10) return new Bitmap(1, 1);

            int padX = (int)(faceBox.Width * paddingFactor);
            int padY = (int)(faceBox.Height * paddingFactor);

            int cropX = Math.Max(0, faceBox.X - padX);
            int cropY = Math.Max(0, faceBox.Y - padY);
            int cropW = Math.Min(sourceFrame.Width - cropX, faceBox.Width + (padX * 2));
            int cropH = Math.Min(sourceFrame.Height - cropY, faceBox.Height + (padY * 2));

            var cropRect = new System.Drawing.Rectangle(cropX, cropY, cropW, cropH);
            var dest = new Bitmap(220, 220, PixelFormat.Format24bppRgb);
            using (var g = Graphics.FromImage(dest))
            {
                g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                g.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
                g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.HighQuality;
                g.DrawImage(sourceFrame, new System.Drawing.Rectangle(0, 0, 220, 220), cropRect, GraphicsUnit.Pixel);
            }
            return dest;
        }

        public static string ConvertBitmapToBase64Jpeg(Bitmap bmp, long quality = 85L)
        {
            if (bmp == null) return string.Empty;
            using var ms = new MemoryStream();
            ImageCodecInfo? jpegCodec = null;
            foreach (var c in ImageCodecInfo.GetImageEncoders())
            {
                if (c.FormatID == ImageFormat.Jpeg.Guid) { jpegCodec = c; break; }
            }

            if (jpegCodec != null)
            {
                using var encParams = new EncoderParameters(1);
                encParams.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, quality);
                bmp.Save(ms, jpegCodec, encParams);
            }
            else
            {
                bmp.Save(ms, ImageFormat.Jpeg);
            }
            return "data:image/jpeg;base64," + Convert.ToBase64String(ms.ToArray());
        }

        public static void TestModelInference()
        {
            var sb = new System.Text.StringBuilder();
            Action<string> log = (msg) => {
                Console.WriteLine(msg);
                sb.AppendLine(msg);
            };

            string yunetPath = ResolveModelPath("face_detection_yunet_2023mar.onnx");
            string sfacePath = ResolveModelPath("face_recognition_sface_2021dec.onnx");

            log($"[DIAGNOSTIC] Checking YuNet at: {yunetPath} (Exists: {File.Exists(yunetPath)})");
            log($"[DIAGNOSTIC] Checking SFace at: {sfacePath} (Exists: {File.Exists(sfacePath)})");

            try
            {
                using var engine = new FaceEngine();
                log($"[DIAGNOSTIC] FaceEngine initialized. YuNetActive={engine.IsYuNetActive}, SFaceActive={engine.IsSFaceActive}");

                string testImagePath = "test_user_face.png";
                if (!File.Exists(testImagePath)) testImagePath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "test_user_face.png");
                if (!File.Exists(testImagePath)) testImagePath = @"D:\BAS-SOFTWARE\feature-dual-biometric-face\test_user_face.png";

                if (File.Exists(testImagePath))
                {
                    log($"[DIAGNOSTIC] Loading test image from: {testImagePath}");
                    using var testImg = Cv2.ImRead(testImagePath);
                    log($"[DIAGNOSTIC] Image size: {testImg.Width}x{testImg.Height}");

                    var detected = engine.DetectFaceYuNet(testImg);
                    if (detected != null)
                    {
                        log($"[DIAGNOSTIC] Face detected! Box=[{detected.BoundingBox.X},{detected.BoundingBox.Y},{detected.BoundingBox.Width},{detected.BoundingBox.Height}], Confidence={detected.Confidence * 100:F1}%");
                        log($"[DIAGNOSTIC] Pose: {detected.PoseLabel}, Yaw: {detected.YawDegrees:F1}°, IsLive: {detected.IsLive}, Quality: {detected.LivenessScore:F2}");

                        if (detected.HasLandmarks)
                        {
                            var emb = engine.ExtractSFaceEmbedding(testImg, detected.Landmarks);
                            log($"[DIAGNOSTIC] SFace embedding extracted: {emb != null && emb.Count == 128} (Dim={emb?.Count ?? 0})");
                            if (emb != null && emb.Count == 128)
                            {
                                log($"[DIAGNOSTIC] Embedding sample: [{emb[0]:F3}, {emb[1]:F3}, {emb[2]:F3}, {emb[3]:F3}]");

                                var localFaces = LocalFaceStore.GetEnrolledFaceDtos();
                                log($"[DIAGNOSTIC] Enrolled faces in local DB: {localFaces.Count}");
                                foreach (var lf in localFaces)
                                {
                                    float sim = FaceEngine.ComputeCosineSimilarity(emb, lf.faceTemplate);
                                    log($"[DIAGNOSTIC] Match against {lf.name} ({lf.code}): Similarity={sim:F4} (MatchThreshold=0.36: {sim >= 0.36f})");
                                }
                            }
                        }
                    }
                    else
                    {
                        log("[DIAGNOSTIC] No face detected in test image.");
                    }
                }
            }
            catch (Exception ex)
            {
                log("[DIAGNOSTIC] TestModelInference error: " + ex.ToString());
            }

            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                File.WriteAllText(Path.Combine(baseDir, "model_diagnostic_result.txt"), sb.ToString());
                File.WriteAllText(@"D:\BAS-SOFTWARE\feature-dual-biometric-face\model_diagnostic_result.txt", sb.ToString());
            }
            catch { }
        }

        public void Dispose()
        {
            try
            {
                _netYuNet?.Dispose();
                _netSFace?.Dispose();
                _faceCascade?.Dispose();
                _eyeCascade?.Dispose();
            }
            catch { }
        }
    }
}
