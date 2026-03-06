Get-ChildItem 'C:\project\sancho\dist-backend\main\_internal' -Directory | ForEach-Object {
    $s = (Get-ChildItem $_.FullName -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
    [PSCustomObject]@{SizeMB=[math]::Round($s/1MB,1); Name=$_.Name}
} | Sort-Object SizeMB -Descending | Select-Object -First 25 | Format-Table -AutoSize

Write-Host "`n--- Large files (>3MB) ---"
Get-ChildItem 'C:\project\sancho\dist-backend\main\_internal' -File | Where-Object { $_.Length -gt 3MB } | Sort-Object Length -Descending | ForEach-Object {
    [PSCustomObject]@{SizeMB=[math]::Round($_.Length/1MB,1); Name=$_.Name}
} | Format-Table -AutoSize

Write-Host "`n--- Total dist-backend size ---"
$total = (Get-ChildItem 'C:\project\sancho\dist-backend' -Recurse -File | Measure-Object -Property Length -Sum).Sum
Write-Host "$([math]::Round($total/1MB,1)) MB"
