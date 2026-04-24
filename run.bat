@echo off
echo ================================================
echo   IGREJA ABA - Sistema de Registro de Culto v3
echo ================================================
echo.
echo Verificando Python...
python --version
echo.
echo Instalando dependencias...
pip install -r requirements.txt
echo.
echo Iniciando servidor...
echo.
echo Acesse no navegador:  http://localhost:5000
echo Acesse pelo celular:  http://[SEU-IP]:5000
echo (Para saber seu IP: abra outro terminal e digite ipconfig)
echo.
python app.py
pause
