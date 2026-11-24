# Cloudflare Pages Custom Domain Setup via API
# Run in: C:\Users\studio alex\OneDrive\Documentos\Alexdesign\alexdesign2027
# Requires: Cloudflare API Token with Pages:Edit permissions

$apiToken = Read-Host "Enter Cloudflare API Token (with Pages:Edit)" -AsSecureString
$token = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($apiToken))

$accountId = "151fdde4cee084ff39025c40b03bde3a"  # From your dashboard URL
$projectName = "alexdesign-design2027"
$zoneName = "alexdesign.art.br"
$domains = @("www.alexdesign.art.br", "alexdesign.art.br")

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type"  = "application/json"
}

# Get zone ID
$zoneResp = Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/zones?name=$zoneName" -Headers $headers -Method Get
if (-not $zoneResp.success) { throw "Failed to get zone: $($zoneResp.errors)" }
$zoneId = $zoneResp.result.id
Write-Host "Zone ID: $zoneId" -ForegroundColor Green

# Add each domain
foreach ($domain in $domains) {
    Write-Host "Adding $domain to Pages project..." -ForegroundColor Yellow
    
    $body = @{
        hostname = $domain
    } | ConvertTo-Json -Depth 3
    
    $resp = Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/accounts/$accountId/pages/projects/$projectName/domains" `
        -Headers $headers -Method Post -Body $body
    
    if ($resp.success) {
        Write-Host "✓ $domain added successfully" -ForegroundColor Green
        Write-Host "  Verification: $($resp.result.verification)" -ForegroundColor Cyan
    } else {
        if ($resp.errors[0].code -eq 10000) {
            Write-Host "⚠ $domain already exists" -ForegroundColor Yellow
        } else {
            Write-Host "✗ Failed to add $domain: $($resp.errors)" -ForegroundColor Red
        }
    }
}

Write-Host "`nDone. Check Pages dashboard → Custom domains for status." -ForegroundColor Green