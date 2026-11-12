using System;
using System.Collections.Generic;
using System.Drawing;
using System.Threading;
using System.Runtime.InteropServices;
using OpenCvSharp;
using OpenCvSharp.Extensions;

namespace BiometricApp
{
    public class CameraDevice
    {
        public int Index { get; set; }
        public string Name { get; set; } = string.Empty;
        public bool IsExternal { get; set; }

        public override string ToString() => Name;
    }

    [ComImport, Guid("62BE5D10-60EB-11d0-BD3B-00A0C911CE86")]
    internal class CreateDevEnum { }

    [ComImport, Guid("29840822-5B84-11D0-BD3B-00A0C911CE86"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface ICreateDevEnum
    {
        [PreserveSig]
        int CreateClassEnumerator([In, MarshalAs(UnmanagedType.LPStruct)] Guid pType, out System.Runtime.InteropServices.ComTypes.IEnumMoniker ppEnumMoniker, [In] int dwFlags);
    }

    [ComImport, Guid("55272A00-42CB-11CE-8135-00AA004BB851"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IPropertyBag
    {
        [PreserveSig]
        int Read([In, MarshalAs(UnmanagedType.LPWStr)] string pszPropName, [In, Out, MarshalAs(UnmanagedType.Struct)] ref object pVar, [In] IntPtr pErrorLog);
    }

    public class CameraManager : IDisposable
    {
        private readonly object _stateLock = new object();
        private static readonly object s_hardwareInitLock = new object();

        private Thread? _captureThread;
        private volatile bool _isRunning = false;
        private long _activeSessionId = 0;

        public event Action<Bitmap>? NewFrameReceived;
        public event Action<string>? CameraStatusChanged;

        public bool IsRunning => _isRunning;
        public int CurrentCameraIndex { get; private set; } = -1;

        public static List<CameraDevice> GetAvailableCameras()
        {
            var cameras = new List<CameraDevice>();
            ICreateDevEnum? devEnum = null;
            System.Runtime.InteropServices.ComTypes.IEnumMoniker? enumMoniker = null;

            try
            {
                // Enumerate video devices via Windows DirectShow COM
                Guid CLSID_VideoInputDeviceCategory = new Guid("860BB310-5D01-11d0-BD3B-00A0C911CE86");
                devEnum = (ICreateDevEnum)new CreateDevEnum();
                int hr = devEnum.CreateClassEnumerator(CLSID_VideoInputDeviceCategory, out enumMoniker, 0);

                if (hr == 0 && enumMoniker != null)
                {
                    var monikers = new System.Runtime.InteropServices.ComTypes.IMoniker[1];
                    int index = 0;

                    while (enumMoniker.Next(1, monikers, IntPtr.Zero) == 0)
                    {
                        var moniker = monikers[0];
                        if (moniker == null) continue;

                        object? bagObj = null;
                        try
                        {
                            Guid IID_IPropertyBag = typeof(IPropertyBag).GUID;
                            moniker.BindToStorage(null, null, ref IID_IPropertyBag, out bagObj);

                            string friendlyName = $"Camera {index}";
                            if (bagObj is IPropertyBag bag)
                            {
                                object val = "";
                                int readHr = bag.Read("FriendlyName", ref val, IntPtr.Zero);
                                if (readHr == 0 && val != null)
                                {
                                    string s = val.ToString() ?? string.Empty;
                                    if (!string.IsNullOrWhiteSpace(s)) friendlyName = s;
                                }
                            }

                            bool isVirtual = friendlyName.IndexOf("virtual", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                             friendlyName.IndexOf("obs", StringComparison.OrdinalIgnoreCase) >= 0;
                            bool isExt = friendlyName.IndexOf("usb", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                         friendlyName.IndexOf("aukey", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                         friendlyName.IndexOf("external", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                         friendlyName.IndexOf("webcam", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                         index > 0;

                            string icon = isVirtual ? "📹 " : (isExt ? "📷 " : "💻 ");
                            cameras.Add(new CameraDevice
                            {
                                Index = index,
                                Name = $"{icon}{friendlyName}",
                                IsExternal = isExt && !isVirtual
                            });
                        }
                        catch { }
                        finally
                        {
                            if (bagObj != null && Marshal.IsComObject(bagObj))
                            {
                                Marshal.ReleaseComObject(bagObj);
                            }
                            if (Marshal.IsComObject(moniker))
                            {
                                Marshal.ReleaseComObject(moniker);
                            }
                        }
                        index++;
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("DirectShow camera enum notice: " + ex.Message);
            }
            finally
            {
                if (enumMoniker != null && Marshal.IsComObject(enumMoniker))
                {
                    Marshal.ReleaseComObject(enumMoniker);
                }
                if (devEnum != null && Marshal.IsComObject(devEnum))
                {
                    Marshal.ReleaseComObject(devEnum);
                }
            }

            // Fallback: If no cameras detected via COM, provide default index 0 candidate
            if (cameras.Count == 0)
            {
                cameras.Add(new CameraDevice { Index = 0, Name = "📷 Default Camera (Device 0)", IsExternal = true });
            }

            return cameras;
        }

        public void Start(int cameraIndex = 0)
        {
            lock (_stateLock)
            {
                // If camera is already actively running on requested index, avoid redundant restart
                if (_isRunning && CurrentCameraIndex == cameraIndex && _captureThread != null && _captureThread.IsAlive)
                {
                    return;
                }
            }

            // Cleanly stop any existing capture thread OUTSIDE any locks
            Stop();

            long sessionId;
            lock (_stateLock)
            {
                sessionId = ++_activeSessionId;
                _isRunning = true;
                CurrentCameraIndex = cameraIndex;

                _captureThread = new Thread(() => RunCaptureSession(sessionId, cameraIndex))
                {
                    IsBackground = true,
                    Name = $"CameraCaptureThread_Session_{sessionId}"
                };
                _captureThread.Start();
            }
        }

        private void RunCaptureSession(long sessionId, int cameraIndex)
        {
            VideoCapture? cap = null;
            try
            {
                // Step 1: Validate session under _stateLock and RELEASE before touching hardware
                bool shouldProceed;
                lock (_stateLock)
                {
                    shouldProceed = (_isRunning && sessionId == _activeSessionId);
                }
                if (!shouldProceed) return;

                // Step 2: Acquire hardware lock INDEPENDENTLY (locks are never held simultaneously)
                lock (s_hardwareInitLock)
                {
                    cap = new VideoCapture(cameraIndex, VideoCaptureAPIs.DSHOW);
                    if (!cap.IsOpened())
                    {
                        // USB DirectShow driver often needs a split-second to release after stop
                        Thread.Sleep(100);
                        cap.Dispose();
                        cap = new VideoCapture(cameraIndex, VideoCaptureAPIs.DSHOW);
                    }
                    if (!cap.IsOpened())
                    {
                        cap.Dispose();
                        cap = new VideoCapture(cameraIndex);
                    }
                }

                if (!cap.IsOpened())
                {
                    lock (s_hardwareInitLock)
                    {
                        cap.Dispose();
                        cap = null;
                    }
                    lock (_stateLock)
                    {
                        if (sessionId == _activeSessionId)
                        {
                            _isRunning = false;
                            CurrentCameraIndex = -1;
                        }
                    }
                    CameraStatusChanged?.Invoke($"Camera {cameraIndex} could not be opened.");
                    return;
                }

                // Configure stream properties
                try
                {
                    cap.Set(VideoCaptureProperties.FrameWidth, 1280);
                    cap.Set(VideoCaptureProperties.FrameHeight, 720);
                    cap.Set(VideoCaptureProperties.Fps, 30);
                }
                catch { }

                // Step 3: Check if session was cancelled while initializing
                bool isStale;
                lock (_stateLock)
                {
                    isStale = (!_isRunning || sessionId != _activeSessionId);
                }
                if (isStale)
                {
                    lock (s_hardwareInitLock)
                    {
                        if (cap != null)
                        {
                            if (cap.IsOpened()) cap.Release();
                            cap.Dispose();
                            cap = null;
                        }
                    }
                    return;
                }

                CameraStatusChanged?.Invoke($"Camera {cameraIndex} active");
                CaptureLoop(sessionId, cap);
            }
            catch (Exception ex)
            {
                lock (_stateLock)
                {
                    if (sessionId == _activeSessionId)
                    {
                        _isRunning = false;
                        CurrentCameraIndex = -1;
                    }
                }
                CameraStatusChanged?.Invoke("Camera Error: " + ex.Message);
            }
            finally
            {
                if (cap != null)
                {
                    try
                    {
                        lock (s_hardwareInitLock)
                        {
                            if (cap.IsOpened()) cap.Release();
                            cap.Dispose();
                            cap = null;
                        }
                    }
                    catch { }
                }
            }
        }

        private void CaptureLoop(long sessionId, VideoCapture capture)
        {
            using var mat = new Mat();
            int consecutiveFailures = 0;

            while (true)
            {
                // Check session validity under lock
                lock (_stateLock)
                {
                    if (!_isRunning || sessionId != _activeSessionId) break;
                }

                if (!capture.IsOpened()) break;

                try
                {
                    if (capture.Read(mat) && !mat.Empty())
                    {
                        consecutiveFailures = 0;
                        Bitmap? bitmap = null;
                        try
                        {
                            bitmap = BitmapConverter.ToBitmap(mat);
                            // Sole ownership contract: Subscriber is responsible for disposing received bitmap
                            NewFrameReceived?.Invoke(bitmap);
                        }
                        catch
                        {
                            // If subscriber throws or invocation drops, ensure bitmap is disposed safely
                            bitmap?.Dispose();
                        }
                    }
                    else
                    {
                        consecutiveFailures++;
                        if (consecutiveFailures >= 35) // Approx 1.5 seconds of frame loss (disconnect)
                        {
                            CameraStatusChanged?.Invoke("Camera feed interrupted or disconnected.");
                            break;
                        }
                        Thread.Sleep(15);
                    }
                }
                catch (Exception ex)
                {
                    consecutiveFailures++;
                    if (consecutiveFailures >= 35)
                    {
                        CameraStatusChanged?.Invoke("Camera read failure: " + ex.Message);
                        break;
                    }
                    Thread.Sleep(30);
                }
            }
        }

        public void Stop()
        {
            Thread? threadToJoin = null;

            lock (_stateLock)
            {
                _activeSessionId++;
                _isRunning = false;
                CurrentCameraIndex = -1;
                threadToJoin = _captureThread;
                _captureThread = null;
            }

            if (threadToJoin != null && threadToJoin.IsAlive && Thread.CurrentThread != threadToJoin)
            {
                try
                {
                    // Non-blocking UI responsiveness: short 150ms join
                    threadToJoin.Join(150);
                }
                catch { }
            }

            CameraStatusChanged?.Invoke("Camera Stopped");
        }

        public void Dispose()
        {
            Stop();
        }
    }
}
