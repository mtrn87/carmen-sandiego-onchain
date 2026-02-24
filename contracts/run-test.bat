@echo off
cd /d "%~dp0"
echo Running PlayerRegistry tests...
call npx hardhat test test/PlayerRegistry.manual.test.ts --network hardhat
pause
