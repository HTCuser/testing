# Chuyen tat ca tai lieu trong mot thu muc sang PDF, ten file khong dau.
# Goi qua chuyen-pdf-khong-dau.bat. Can cai Microsoft Word (va Excel neu co file Excel).
#
#   - Word (.doc .docx .docm .rtf .odt) -> PDF bang chinh Word, giu dung trinh bay
#   - Excel (.xls .xlsx .xlsm)          -> PDF bang Excel
#   - PDF san co                        -> chep sang, doi ten khong dau
#   - Thu muc con duoc giu nguyen cau truc, ten thu muc cung bo dau
#
# KHONG sua, KHONG xoa file goc: ket qua ghi vao thu muc moi
# "<ten thu muc> - PDF" canh thu muc goc, kem file danh-sach-doi-ten.csv
# (ten cu -> ten moi) de doi chieu.
#
# Thong bao de chu khong dau: PowerShell 5 doc file .ps1 theo bang ma ANSI.
param(
    [Parameter(Mandatory = $true)][string]$Folder,
    [string]$Output = ''
)

$ErrorActionPreference = 'Stop'

function Remove-Diacritics([string]$Text) {
    # d gach (U+0111, U+0110) khong tach duoc bang Normalize nen thay rieng.
    $s = $Text.Replace([string][char]0x0111, 'd').Replace([string][char]0x0110, 'D')
    $decomposed = $s.Normalize([Text.NormalizationForm]::FormD)
    $sb = New-Object System.Text.StringBuilder
    foreach ($c in $decomposed.ToCharArray()) {
        if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($c) -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
            [void]$sb.Append($c)
        }
    }
    $clean = $sb.ToString().Normalize([Text.NormalizationForm]::FormC)
    # Gach dai, ngoac kep kieu Word -> ky tu thuong.
    $clean = $clean.Replace([string][char]0x2013, '-').Replace([string][char]0x2014, '-')
    $clean = $clean.Replace([string][char]0x2018, "'").Replace([string][char]0x2019, "'")
    $clean = $clean.Replace([string][char]0x201C, "'").Replace([string][char]0x201D, "'")
    # Ky tu con lai ngoai ASCII (hiem gap) thay bang gach duoi; gop khoang trang thua.
    $clean = [regex]::Replace($clean, '[^\x20-\x7E]', '_')
    $clean = [regex]::Replace($clean, '\s{2,}', ' ').Trim()
    return $clean
}

function Get-FreePath([string]$Path) {
    # Hai file khac nhau bo dau ra trung ten: them (2), (3)...
    if (-not (Test-Path -LiteralPath $Path)) { return $Path }
    $dir = Split-Path -Parent $Path
    $base = [IO.Path]::GetFileNameWithoutExtension($Path)
    $ext = [IO.Path]::GetExtension($Path)
    for ($i = 2; ; $i++) {
        $cand = Join-Path $dir "$base ($i)$ext"
        if (-not (Test-Path -LiteralPath $cand)) { return $cand }
    }
}

$Folder = $Folder.Trim().Trim('"').TrimEnd('\')
if (-not (Test-Path -LiteralPath $Folder -PathType Container)) {
    Write-Host "[LOI] Khong thay thu muc: $Folder"
    exit 1
}
$Folder = (Resolve-Path -LiteralPath $Folder).ProviderPath
if (-not $Output) {
    $parent = Split-Path -Parent $Folder
    $Output = Join-Path $parent ((Remove-Diacritics (Split-Path -Leaf $Folder)) + ' - PDF')
}
New-Item -ItemType Directory -Force -Path $Output | Out-Null

$wordExt = @('.doc', '.docx', '.docm', '.rtf', '.odt', '.dot', '.dotx')
$excelExt = @('.xls', '.xlsx', '.xlsm')
$files = @(Get-ChildItem -LiteralPath $Folder -Recurse -File | Where-Object { -not $_.Name.StartsWith('~$') })
Write-Host "Thu muc goc : $Folder"
Write-Host "Ket qua vao : $Output"
Write-Host "So file     : $($files.Count)"
Write-Host ''

$word = $null
$excel = $null
$log = New-Object System.Collections.Generic.List[object]
$n = 0
try {
    foreach ($f in $files) {
        $n++
        $ext = $f.Extension.ToLower()
        $relDir = $f.DirectoryName.Substring($Folder.Length).TrimStart('\')
        $outDir = $Output
        if ($relDir) {
            $parts = $relDir.Split('\') | ForEach-Object { Remove-Diacritics $_ }
            $outDir = Join-Path $Output ($parts -join '\')
        }
        New-Item -ItemType Directory -Force -Path $outDir | Out-Null
        $target = Get-FreePath (Join-Path $outDir ((Remove-Diacritics $f.BaseName) + '.pdf'))
        $status = 'OK'
        Write-Host ("[{0}/{1}] {2}" -f $n, $files.Count, (Remove-Diacritics $f.Name))
        try {
            if ($ext -eq '.pdf') {
                Copy-Item -LiteralPath $f.FullName -Destination $target
            } elseif ($wordExt -contains $ext) {
                if (-not $word) {
                    $word = New-Object -ComObject Word.Application
                    $word.Visible = $false
                    $word.DisplayAlerts = 0
                }
                # Mat khau gia: file co dat mat khau se bao loi thay vi treo cho nhap.
                $doc = $word.Documents.Open($f.FullName, $false, $true, $false, 'khong-co-mat-khau')
                try { $doc.ExportAsFixedFormat($target, 17) } finally { $doc.Close($false) }
            } elseif ($excelExt -contains $ext) {
                if (-not $excel) {
                    $excel = New-Object -ComObject Excel.Application
                    $excel.Visible = $false
                    $excel.DisplayAlerts = $false
                }
                $wb = $excel.Workbooks.Open($f.FullName, 0, $true, 5, 'khong-co-mat-khau')
                try { $wb.ExportAsFixedFormat(0, $target) } finally { $wb.Close($false) }
            } else {
                $status = 'Bo qua (khong phai Word/Excel/PDF)'
                $target = ''
            }
        } catch {
            $status = "LOI: $($_.Exception.Message)"
            $target = ''
            Write-Host "     $status"
        }
        $log.Add([pscustomobject]@{
            'Ten cu'     = $f.FullName.Substring($Folder.Length).TrimStart('\')
            'Ten moi'    = if ($target) { $target.Substring($Output.Length).TrimStart('\') } else { '' }
            'Trang thai' = $status
        })
    }
} finally {
    if ($word) { $word.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word) }
    if ($excel) { $excel.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel) }
}

$csv = Join-Path $Output 'danh-sach-doi-ten.csv'
# UTF-8 co BOM de Excel mo dung tieng Viet o cot "Ten cu".
$log | Export-Csv -LiteralPath $csv -NoTypeInformation -Encoding UTF8
$ok = @($log | Where-Object { $_.'Trang thai' -eq 'OK' }).Count
$err = @($log | Where-Object { $_.'Trang thai' -like 'LOI*' }).Count
$skip = $log.Count - $ok - $err
Write-Host ''
Write-Host "Xong: $ok file PDF, $err loi, $skip bo qua."
Write-Host "Ket qua: $Output"
Write-Host "Doi chieu ten cu - ten moi: $csv"
