$ErrorActionPreference = "Stop"
try {
    $body = @{username='admin';password='admin123'} | ConvertTo-Json
    $login = Invoke-WebRequest -Uri "http://localhost:3000/api/finance/login" -Method Post -Body $body -ContentType "application/json" -UseBasicParsing
    $data = $login.Content | ConvertFrom-Json
    $token = $data.token
    Write-Host "1. LOGIN: OK" -ForegroundColor Green
    Write-Host "   User: $($data.user.full_name) ($($data.user.role))"

    $headers = @{Authorization="Bearer $token"}

    $pcItems = Invoke-WebRequest -Uri "http://localhost:3000/api/finance/petty-cash-items" -Headers $headers -UseBasicParsing
    $pcData = $pcItems.Content | ConvertFrom-Json
    Write-Host "2. PETTY CASH ITEMS: OK" -ForegroundColor Green
    Write-Host "   Standalone: $($pcData.items.Count)"
    $groupNames = if ($pcData.groups.psobject.Properties) { ($pcData.groups.psobject.Properties.Name) -join ', ' } else { "none" }
    Write-Host "   Groups: $groupNames"

    $cats = Invoke-WebRequest -Uri "http://localhost:3000/api/finance/collection-categories" -Headers $headers -UseBasicParsing
    $catData = $cats.Content | ConvertFrom-Json
    Write-Host "3. COLLECTION CATEGORIES: OK" -ForegroundColor Green
    $hasDorcas = $catData | Where-Object { $_.name -eq 'Dorcas Kitty' }
    Write-Host "   Dorcas Kitty present: $($hasDorcas -ne $null)"

    $expItems = Invoke-WebRequest -Uri "http://localhost:3000/api/finance/expenditure-items" -Headers $headers -UseBasicParsing
    $expData = $expItems.Content | ConvertFrom-Json
    Write-Host "4. EXPENDITURE ITEMS: OK" -ForegroundColor Green
    $hasDorcasExp = $expData | Where-Object { $_.name -eq 'Dorcas Kitty' }
    Write-Host "   Dorcas Kitty present: $($hasDorcasExp -ne $null)"

    $pcCheque = Invoke-WebRequest -Uri "http://localhost:3000/api/finance/petty-cash/current" -Headers $headers -UseBasicParsing
    $chequeData = $pcCheque.Content | ConvertFrom-Json
    Write-Host "5. PETTY CASH CURRENT: OK" -ForegroundColor Green
    Write-Host "   Cheque exists: $($chequeData -ne $null)"

    $dev = Invoke-WebRequest -Uri "http://localhost:3000/api/finance/development" -Headers $headers -UseBasicParsing
    Write-Host "6. DEVELOPMENT: OK" -ForegroundColor Green

    $rep = Invoke-WebRequest -Uri "http://localhost:3000/api/finance/report?token=$token&start_date=2026-01-01&end_date=2026-12-31" -UseBasicParsing
    Write-Host "7. REPORT: OK (Status $($rep.StatusCode))" -ForegroundColor Green

    $pcReport = Invoke-WebRequest -Uri "http://localhost:3000/api/finance/petty-cash/report?token=$token&start_date=2026-01-01&end_date=2026-12-31" -UseBasicParsing
    Write-Host "8. PETTY CASH REPORT: OK (Status $($pcReport.StatusCode))" -ForegroundColor Green

    Write-Host "`n========== ALL ENDPOINTS WORKING ==========" -ForegroundColor Green
}
catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
    exit 1
}
