# Save this as verify-files.ps1 and run it from your project root
# Run: .\verify-files.ps1

Write-Host "`n=== CATALOGPRO FILE VERIFICATION ===" -ForegroundColor Cyan
Write-Host "Project: C:\Users\gsjen\programs\catalogpro`n" -ForegroundColor Gray

# Check if we're in the right directory
if (-not (Test-Path "src\services\Offlinestorage.ts")) {
    Write-Host "ERROR: Not in project root or file not found!" -ForegroundColor Red
    Write-Host "Make sure you're running this from: C:\Users\gsjen\programs\catalogpro" -ForegroundColor Yellow
    exit
}

# 1. Check Offlinestorage.ts
Write-Host "[1/3] Checking Offlinestorage.ts..." -ForegroundColor Cyan
$offlineStorageLines = (Get-Content "src\services\Offlinestorage.ts").Count
$hasUpsertPhoto = Select-String -Path "src\services\Offlinestorage.ts" -Pattern "async upsertPhoto" -Quiet
$hasUpsertPhotoBlob = Select-String -Path "src\services\Offlinestorage.ts" -Pattern "async upsertPhotoBlob" -Quiet
$hasDeletePhotoBlob = Select-String -Path "src\services\Offlinestorage.ts" -Pattern "async deletePhotoBlob" -Quiet
$hasGetUnsyncedPhotos = Select-String -Path "src\services\Offlinestorage.ts" -Pattern "async getUnsyncedPhotos" -Quiet

Write-Host "  Line count: " -NoNewline
if ($offlineStorageLines -eq 337) {
    Write-Host "$offlineStorageLines ✓" -ForegroundColor Green
} else {
    Write-Host "$offlineStorageLines ✗ (should be 337)" -ForegroundColor Red
}

Write-Host "  upsertPhoto: " -NoNewline
Write-Host $(if ($hasUpsertPhoto) { "✓" } else { "✗ MISSING!" }) -ForegroundColor $(if ($hasUpsertPhoto) { "Green" } else { "Red" })

Write-Host "  upsertPhotoBlob: " -NoNewline
Write-Host $(if ($hasUpsertPhotoBlob) { "✓" } else { "✗ MISSING!" }) -ForegroundColor $(if ($hasUpsertPhotoBlob) { "Green" } else { "Red" })

Write-Host "  deletePhotoBlob: " -NoNewline
Write-Host $(if ($hasDeletePhotoBlob) { "✓" } else { "✗ MISSING!" }) -ForegroundColor $(if ($hasDeletePhotoBlob) { "Green" } else { "Red" })

Write-Host "  getUnsyncedPhotos: " -NoNewline
Write-Host $(if ($hasGetUnsyncedPhotos) { "✓" } else { "✗ MISSING!" }) -ForegroundColor $(if ($hasGetUnsyncedPhotos) { "Green" } else { "Red" })

# 2. Check ScrollableTabs.tsx
Write-Host "`n[2/3] Checking ScrollableTabs.tsx..." -ForegroundColor Cyan
$hasSortOption = Select-String -Path "src\components\ScrollableTabs.tsx" -Pattern "interface SortOption" -Quiet
$hasArrowUpDown = Select-String -Path "src\components\ScrollableTabs.tsx" -Pattern "ArrowUpDown" -Quiet
$hasOnSortChange = Select-String -Path "src\components\ScrollableTabs.tsx" -Pattern "onSortChange" -Quiet

Write-Host "  SortOption interface: " -NoNewline
Write-Host $(if ($hasSortOption) { "✓" } else { "✗ MISSING!" }) -ForegroundColor $(if ($hasSortOption) { "Green" } else { "Red" })

Write-Host "  ArrowUpDown icon: " -NoNewline
Write-Host $(if ($hasArrowUpDown) { "✓" } else { "✗ MISSING!" }) -ForegroundColor $(if ($hasArrowUpDown) { "Green" } else { "Red" })

Write-Host "  onSortChange prop: " -NoNewline
Write-Host $(if ($hasOnSortChange) { "✓" } else { "✗ MISSING!" }) -ForegroundColor $(if ($hasOnSortChange) { "Green" } else { "Red" })

# 3. Check SaleDetail.tsx
Write-Host "`n[3/3] Checking SaleDetail.tsx..." -ForegroundColor Cyan
$hasActiveSorts = Select-String -Path "src\components\SaleDetail.tsx" -Pattern "activeSorts" -Quiet
$hasHandleSortChange = Select-String -Path "src\components\SaleDetail.tsx" -Pattern "handleSortChange" -Quiet
$hasSortOptions = Select-String -Path "src\components\SaleDetail.tsx" -Pattern "sortOptions:" -Quiet

Write-Host "  activeSorts state: " -NoNewline
Write-Host $(if ($hasActiveSorts) { "✓" } else { "✗ MISSING!" }) -ForegroundColor $(if ($hasActiveSorts) { "Green" } else { "Red" })

Write-Host "  handleSortChange: " -NoNewline
Write-Host $(if ($hasHandleSortChange) { "✓" } else { "✗ MISSING!" }) -ForegroundColor $(if ($hasHandleSortChange) { "Green" } else { "Red" })

Write-Host "  sortOptions array: " -NoNewline
Write-Host $(if ($hasSortOptions) { "✓" } else { "✗ MISSING!" }) -ForegroundColor $(if ($hasSortOptions) { "Green" } else { "Red" })

# Final verdict
Write-Host "`n=== VERDICT ===" -ForegroundColor Cyan

$allCorrect = ($offlineStorageLines -eq 337) -and $hasUpsertPhoto -and $hasUpsertPhotoBlob -and 
              $hasDeletePhotoBlob -and $hasGetUnsyncedPhotos -and $hasSortOption -and 
              $hasArrowUpDown -and $hasOnSortChange -and $hasActiveSorts -and 
              $hasHandleSortChange -and $hasSortOptions

if ($allCorrect) {
    Write-Host "✓ ALL FILES ARE CORRECT!" -ForegroundColor Green
    Write-Host "`nFiles are perfect. If build still fails:" -ForegroundColor Yellow
    Write-Host "  1. Close VS Code completely" -ForegroundColor White
    Write-Host "  2. Reopen VS Code" -ForegroundColor White
    Write-Host "  3. Press Ctrl+Shift+P → 'TypeScript: Restart TS Server'" -ForegroundColor White
    Write-Host "  4. Wait 10 seconds" -ForegroundColor White
    Write-Host "  5. Run: npm run build" -ForegroundColor White
} else {
    Write-Host "✗ FILES ARE INCORRECT - NEED TO REPLACE" -ForegroundColor Red
    Write-Host "`nOne or more files are missing required code." -ForegroundColor Yellow
    Write-Host "Please download and replace the files from the outputs folder." -ForegroundColor White
}

Write-Host "`n"
