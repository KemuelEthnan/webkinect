@echo off
echo ============================================================
echo Trimesh Alternative Setup
echo (Use this if Open3D installation failed)
echo ============================================================
echo.

echo [1/3] Checking Python installation...
python --version
if %errorlevel% neq 0 (
    echo ERROR: Python not found!
    pause
    exit /b 1
)
echo.

echo [2/3] Installing Trimesh and dependencies...
echo This is much lighter than Open3D and easier to install!
echo.
pip install -r requirements_trimesh.txt
if %errorlevel% neq 0 (
    echo ERROR: Failed to install dependencies!
    pause
    exit /b 1
)
echo.

echo [3/3] Verifying Trimesh installation...
python -c "import trimesh; print('Trimesh version:', trimesh.__version__)"
if %errorlevel% neq 0 (
    echo ERROR: Trimesh installation failed!
    pause
    exit /b 1
)
echo.

echo ============================================================
echo Trimesh setup completed successfully!
echo ============================================================
echo.
echo To start the server with Trimesh, run:
echo     python app_trimesh_alternative.py
echo.
echo Or use: start-server-trimesh.bat
echo.
echo Note: Results will be slightly different from Open3D,
echo       but quality is still good!
echo.
pause
