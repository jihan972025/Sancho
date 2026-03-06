Get-ChildItem 'C:\project\sancho\dist-backend\main' -Directory | ForEach-Object {
    $s = (Get-ChildItem $_.FullName -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
    [PSCustomObject]@{SizeMB=[math]::Round($s/1MB,1); Name=$_.Name}
} | Sort-Object SizeMB -Descending | Select-Object -First 20 | Format-Table -AutoSize
