@echo off
echo ============================================================
echo Ball Pivoting Mesh Server - Setup Script
echo ============================================================
echo.

echo [1/3] Checking Python installation...
python --version
if %errorlevel% neq 0 (
    echo ERROR: Python not found! Please install Python 3.8+ first.
    pause
    exit /b 1
)
echo.

echo [2/3] Installing Python dependencies...
echo This may take a few minutes...
echo.
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo ERROR: Failed to install dependencies!
    pause
    exit /b 1
)
echo.

echo [3/3] Verifying Open3D installation...
python -c "import open3d; print('Open3D version:', open3d.__version__)"
if %errorlevel% neq 0 (
    echo ERROR: Open3D installation failed!
    pause
    exit /b 1
)
echo.

echo ============================================================
echo Setup completed successfully!
echo ============================================================
echo.
echo To start the server, run:
echo     python app.py
echo.
echo Or double-click: start-server.bat
echo.
pause
