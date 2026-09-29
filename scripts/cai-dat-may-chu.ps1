# Cai dat phan mem Tro ly ky thuat Hua Na thanh may chu chay nen tren Windows.
# Goi qua cai-dat-may-chu.bat (tu xin quyen Administrator). Chay lai nhieu lan
# van an toan: moi lan chay la cai dat lai tu dau.
#
#   - Mo cong tuong lua cho cac may khac trong mang noi bo truy cap
#   - Tac vu "HuaNa - Tro ly ky thuat": tu chay phan mem khi bat may, khong
#     can ai dang nhap Windows; tu chay lai neu phan mem bi tat bat thuong
#   - Tac vu "HuaNa - Sao luu du lieu": sao luu luc 11:50 va 23:50 hang ngay
#   - Tat che do ngu (Sleep) khi cam dien
#
# Thong bao de chu khong dau: PowerShell 5 doc file .ps1 theo bang ma ANSI.
param([switch]$GoBo)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$TaskServer = 'HuaNa - Tro ly ky thuat'
$TaskBackup = 'HuaNa - Sao luu du lieu'
$RuleName = 'HuaNa - Tro ly ky thuat'

function Read-EnvValue([string]$Name, [string]$Default) {
    foreach ($f in @('.env', '.env.txt')) {
        $p = Join-Path $Root $f
        if (Test-Path $p) {
            foreach ($line in Get-Content $p -Encoding UTF8) {
                if ($line -match "^\s*$Name\s*=\s*(.+?)\s*$") { return $Matches[1].Trim('"', "'") }
            }
            return $Default
        }
    }
    return $Default
}

function Stop-Server([int]$Port) {
    if (Get-ScheduledTask -TaskName $TaskServer -ErrorAction SilentlyContinue) {
        Stop-ScheduledTask -TaskName $TaskServer -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 1
    foreach ($c in @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)) {
        $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
        if ($proc -and $proc.ProcessName -like 'python*') {
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        }
    }
}

$Port = [int](Read-EnvValue 'PORT' '8000')

if ($GoBo) {
    Write-Host '==> Go cai dat may chu'
    Stop-Server $Port
    Unregister-ScheduledTask -TaskName $TaskServer -Confirm:$false -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskBackup -Confirm:$false -ErrorAction SilentlyContinue
    Remove-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
    Write-Host '    Da go tac vu tu chay, tac vu sao luu va quy tac tuong lua.'
    Write-Host '    Du lieu (thu muc data, thu muc sao luu) van giu nguyen.'
    exit 0
}

Write-Host ''
Write-Host '==> 1. Kiem tra'
$Python = Join-Path $Root '.venv\Scripts\python.exe'
if (-not (Test-Path $Python)) {
    Write-Host '[LOI] Chua co moi truong Python (.venv).'
    Write-Host '      Chay run.bat mot lan cho cai xong thu vien, tat cua so do, roi chay lai file nay.'
    exit 1
}
Write-Host "    Thu muc phan mem: $Root"
Write-Host "    Cong: $Port"

$busy = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
if ($busy.Count -gt 0) {
    Stop-Server $Port
    Start-Sleep -Seconds 2
    $busy = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    if ($busy.Count -gt 0) {
        $name = (Get-Process -Id $busy[0].OwningProcess -ErrorAction SilentlyContinue).ProcessName
        Write-Host "[LOI] Cong $Port dang bi chuong trinh '$name' chiem."
        Write-Host '      Neu la cua so run.bat dang mo: dong cua so do roi chay lai file nay.'
        exit 1
    }
}

Write-Host "==> 2. Mo cong $Port tren tuong lua Windows"
Remove-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName $RuleName -Direction Inbound -Protocol TCP -LocalPort $Port `
    -Action Allow -Profile Any | Out-Null

Write-Host '==> 3. Tim Ollama (tim kiem ngu nghia bge-m3)'
$Ollama = $null
$cmd = Get-Command ollama.exe -ErrorAction SilentlyContinue
if ($cmd) { $Ollama = $cmd.Source }
if (-not $Ollama) {
    $cand = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
    if (Test-Path $cand) { $Ollama = $cand }
}
$Models = if ($env:OLLAMA_MODELS) { $env:OLLAMA_MODELS } else { Join-Path $env:USERPROFILE '.ollama\models' }
$cfg = @(
    '@echo off',
    'rem Tao tu dong boi cai-dat-may-chu.bat. Chay lai cai-dat-may-chu.bat de tao lai.'
)
if ($Ollama) {
    $cfg += "set OLLAMA_EXE=$Ollama"
    $cfg += "set OLLAMA_MODELS=$Models"
    Write-Host "    Ollama: $Ollama"
    Write-Host "    Mo hinh: $Models"
} else {
    Write-Host '    Khong thay Ollama: phan mem van tra cuu bang tu khoa (khong co tim kiem ngu nghia).'
}
Set-Content -Path (Join-Path $Root 'may-chu.cfg.bat') -Value $cfg -Encoding Default

Write-Host '==> 4. Tac vu tu chay phan mem khi bat may'
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$runner = Join-Path $Root 'scripts\chay-may-chu.bat'
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"`"$runner`"`"" -WorkingDirectory $Root
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $TaskServer -Action $action -Trigger (New-ScheduledTaskTrigger -AtStartup) `
    -Principal $principal -Settings $settings -Force `
    -Description 'Tro ly ky thuat NMTD Hua Na: chay phan mem khi bat may.' | Out-Null

Write-Host '==> 5. Tac vu sao luu 11:50 va 23:50 hang ngay'
$backupBat = Join-Path $Root 'sao-luu.bat'
$bAction = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"`"$backupBat`" /tu-dong`"" -WorkingDirectory $Root
$bTriggers = @((New-ScheduledTaskTrigger -Daily -At '11:50'), (New-ScheduledTaskTrigger -Daily -At '23:50'))
$bSettings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 2) -StartWhenAvailable `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $TaskBackup -Action $bAction -Trigger $bTriggers -Principal $principal `
    -Settings $bSettings -Force -Description 'Tro ly ky thuat NMTD Hua Na: sao luu du lieu.' | Out-Null
$backupDir = Read-EnvValue 'SAO_LUU_DIR' (Join-Path $Root 'sao-luu')
Write-Host "    Thu muc sao luu: $backupDir"
$sameDrive = $false
try { $sameDrive = (Split-Path -Qualifier $backupDir) -eq (Split-Path -Qualifier $Root) } catch { }
if ($sameDrive) {
    Write-Host '    [CANH BAO] Sao luu dang cung o dia voi phan mem. Nen dat SAO_LUU_DIR=D:\SaoLuu-HuaNa'
    Write-Host '               (o khac hoac o cung gan ngoai) trong file .env roi chay lai file nay.'
}

Write-Host '==> 6. Tat che do ngu khi cam dien (may chu phai chay suot)'
powercfg /change standby-timeout-ac 0 | Out-Null
powercfg /change hibernate-timeout-ac 0 | Out-Null

Write-Host '==> 7. Khoi dong phan mem'
Start-ScheduledTask -TaskName $TaskServer
$ok = $false
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 2
    try {
        $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 "http://127.0.0.1:$Port/healthz"
        if ($r.StatusCode -eq 200) { $ok = $true; break }
    } catch { }
}
Write-Host ''
if ($ok) {
    Write-Host '==================== CAI DAT XONG ===================='
    Write-Host ' Phan mem da chay nen va se tu chay moi khi bat may.'
    Write-Host ' Tren may nay mo:        http://localhost:' -NoNewline; Write-Host $Port
    Write-Host ' Cac may khac trong mang mo mot trong cac dia chi:'
    Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
        ForEach-Object { Write-Host "     http://$($_.IPAddress):$Port   ($($_.InterfaceAlias))" }
    Write-Host ' Nho de nghi IT cap dia chi IP co dinh cho may nay.'
    Write-Host ' Nhat ky chay: data\logs\may-chu.log'
    Write-Host '======================================================'
} else {
    Write-Host '[LOI] Phan mem chua chay len sau 2 phut. Xem file data\logs\may-chu.log de biet loi.'
    exit 1
}
