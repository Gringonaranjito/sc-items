$ships = @('Aurora Mk I ES', 'Polaris')
foreach ($ship in $ships) {
  $slug = $ship -replace '[\u2018\u2019''"]', ''
  $slug = $slug -replace '&', 'and'
  $slug = $slug -replace '[^A-Za-z0-9]+', '_'
  $slug = $slug.Trim('_')
  $html = (Invoke-WebRequest -Uri "https://starcitizen.tools/$slug" -UseBasicParsing -TimeoutSec 60).Content
  $ports = $html.Contains('<h2 id="Ports">')
  $sections = [regex]::Matches($html, '<div class="t-entity-ports-subcat"[^>]*>(?<title>[^<]+)</div>', 'Singleline').Count
  $rows = [regex]::Matches($html, '<(?:div|li)\b[^>]*data-port-category="[^"]*"[^>]*>', 'Singleline').Count
  Write-Host "$ship ports=$ports sections=$sections rows=$rows"
}
