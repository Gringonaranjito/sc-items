$html = Get-Content -LiteralPath 'C:\Users\juanc\AppData\Local\Temp\aurora.html' -Raw

function Decode-Text {
  param([string]$Text)
  $value = [System.Net.WebUtility]::HtmlDecode([string]$Text)
  $value = $value -replace '<[^>]+>', ' '
  $value = $value -replace '\s+', ' '
  return $value.Trim()
}

function Get-HtmlAttributeValue {
  param([string]$Html, [string]$Attribute)
  $match = [regex]::Match($Html, '(?i)\b' + [regex]::Escape($Attribute) + '="(?<value>[^"]*)"')
  if ($match.Success) { return Decode-Text $match.Groups['value'].Value }
  return ''
}

$portsIndex = $html.IndexOf('<h2 id="Ports">')
$tail = $html.Substring($portsIndex)
$stopIndex = $tail.IndexOf('<h2 id="Model">')
if ($stopIndex -lt 0) { $stopIndex = $tail.IndexOf('<h2 id="Acquisition">') }
if ($stopIndex -lt 0) { $stopIndex = $tail.Length }
$portsHtml = $tail.Substring(0, $stopIndex)
$sectionMatches = [regex]::Matches($portsHtml, '<div class="t-entity-ports-subcat"[^>]*>(?<title>[^<]+)</div>', 'Singleline')
Write-Host "sections=$($sectionMatches.Count)"
$first = $sectionMatches[0]
$sectionStart = $first.Index + $first.Length
$sectionEnd = if ($sectionMatches.Count -gt 1) { $sectionMatches[1].Index } else { $portsHtml.Length }
$sectionHtml = $portsHtml.Substring($sectionStart, $sectionEnd - $sectionStart)
$rows = [regex]::Matches($sectionHtml, '<(?:div|li)\b[^>]*data-port-category="[^"]*"[^>]*>', 'Singleline')
Write-Host "rows=$($rows.Count)"
$rowHtml = $rows[0].Value
Write-Host "name=$(Get-HtmlAttributeValue -Html $rowHtml -Attribute 'data-equipped-name')"
Write-Host "category=$(Get-HtmlAttributeValue -Html $rowHtml -Attribute 'data-port-category')"
Write-Host "type=$(Get-HtmlAttributeValue -Html $rowHtml -Attribute 'data-port-type')"
Write-Host "count=$(Get-HtmlAttributeValue -Html $rowHtml -Attribute 'data-port-count')"
