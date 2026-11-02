@echo off
rem Compiles both versions with the JDK on PATH (Java 8) and runs the demo against each; exits non-zero on any failure.
setlocal
cd /d "%~dp0code"
if exist ..\out rmdir /s /q ..\out
mkdir ..\out\original ..\out\patched
javac -encoding UTF-8 -source 1.8 -target 1.8 -d ..\out\original original\com\beta\sched\*.java demo\com\beta\sched\Demo.java || exit /b 1
javac -encoding UTF-8 -source 1.8 -target 1.8 -d ..\out\patched patched\com\beta\sched\*.java demo\com\beta\sched\Demo.java || exit /b 1
java -cp ..\out\original com.beta.sched.Demo original || exit /b 1
java -cp ..\out\patched com.beta.sched.Demo patched || exit /b 1
echo VERIFY OK
