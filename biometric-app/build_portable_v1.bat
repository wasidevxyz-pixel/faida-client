@echo off
set "PATH=C:\Program Files (x86)\dotnet;C:\Program Files\dotnet;%PATH%"

echo ========================================================
echo   BAS DUAL BIOMETRIC ^& FACE AI - PORTABLE BUILD v1.0.0
echo ========================================================
echo.

cd /d "%~dp0"

echo [1/3] Restoring NuGet Dependencies (OpenCvSharp + ONNX)...
"C:\Program Files (x86)\dotnet\dotnet.exe" restore BiometricApp.csproj

echo.
echo [2/3] Compiling Standalone Portable Executable (win-x86 Single-File v1)...
taskkill /F /IM BiometricApp.exe >nul 2>&1
"C:\Program Files (x86)\dotnet\dotnet.exe" publish BiometricApp.csproj -c Release -r win-x86 --self-contained true /p:PublishSingleFile=true /p:IncludeNativeLibrariesForSelfExtract=true /p:IncludeAllContentForSelfExtract=true -o "..\publish_output_v1"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Build failed! Please review the error message above.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [3/3] Verifying runtime dependencies and settings...
if exist "appsettings.json" (
    copy /Y "appsettings.json" "..\publish_output_v1\" >nul
)
if exist "Lib" (
    copy /Y "Lib\*.dll" "..\publish_output_v1\" >nul
)
if exist "bin\Release\net6.0-windows\win-x86\OpenCvSharpExtern.dll" (
    copy /Y "bin\Release\net6.0-windows\win-x86\OpenCvSharpExtern.dll" "..\publish_output_v1\" >nul
)
if exist "bin\Release\net6.0-windows\win-x86\onnxruntime.dll" (
    copy /Y "bin\Release\net6.0-windows\win-x86\onnxruntime.dll" "..\publish_output_v1\" >nul
)
if exist "bin\Release\net6.0-windows\win-x86\onnxruntime_providers_shared.dll" (
    copy /Y "bin\Release\net6.0-windows\win-x86\onnxruntime_providers_shared.dll" "..\publish_output_v1\" >nul
)
if exist "haarcascade_*.xml" (
    copy /Y "haarcascade_*.xml" "..\publish_output_v1\" >nul
)
if exist "models" (
    xcopy /E /I /Y "models" "..\publish_output_v1\models\" >nul
)

echo.
echo ========================================================
echo   BUILD COMPLETE!
echo   Portable Output Folder : publish_output_v1
echo   Standalone Application : publish_output_v1\BiometricApp.exe
echo ========================================================

