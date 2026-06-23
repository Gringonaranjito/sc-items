param(
  [string]$OutputPath = (Join-Path $PSScriptRoot "..\buy_items_data.js")
)

$ErrorActionPreference = "Stop"

function Get-UrlText {
  param([Parameter(Mandatory = $true)][string]$Url)
  try {
    return (Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 60).Content
  } catch {
    return ((& curl.exe -s -L --fail $Url) -join "`n")
  }
}

function Decode-Text {
  param([string]$Text)
  $value = [System.Net.WebUtility]::HtmlDecode([string]$Text)
  $value = $value -replace '<[^>]+>', ' '
  $value = $value -replace '\s+', ' '
  return $value.Trim()
}

function Get-ShipSlug {
  param([Parameter(Mandatory = $true)][string]$Name)
  $slug = [string]$Name
  $slug = $slug -replace '[\u2018\u2019''"]', ''
  $slug = $slug -replace '&', 'and'
  $slug = $slug -replace '[^A-Za-z0-9]+', '_'
  return $slug.Trim('_')
}

function Get-ShipPageHtml {
  param([Parameter(Mandatory = $true)][string]$Name)
  $slug = Get-ShipSlug $Name
  return Get-UrlText "https://starcitizen.tools/$slug"
}

function Get-WikiSlug {
  param([Parameter(Mandatory = $true)][string]$Name)
  return Get-ShipSlug $Name
}

function Get-WikiSearchCandidates {
  param([Parameter(Mandatory = $true)][string]$Name)
  $text = Decode-Text $Name
  if (-not $text) { return @() }
  $candidates = New-Object System.Collections.Generic.List[string]
  $candidates.Add($text) | Out-Null
  $compact = $text
  $compact = $compact -replace '^item[_\s-]*name[_\s-]*', ''
  $compact = $compact -replace '^item[_\s-]*', ''
  $compact = $compact -replace '^name[_\s-]*', ''
  $compact = $compact -replace '\b[A-Z]{2,}[_\s-]+\d+[A-Z0-9-]*\b', ' '
  $compact = $compact -replace '_+', ' '
  $compact = $compact -replace '\s+', ' '
  $compact = $compact.Trim()
  if ($compact -and $compact -ne $text) { $candidates.Add($compact) | Out-Null }
  $parts = $text -split '[_\s-]+' | Where-Object { $_ }
  if ($parts.Count -gt 0) {
    $last = $parts[$parts.Count - 1]
    if ($last -and -not $candidates.Contains($last)) { $candidates.Add($last) | Out-Null }
  }
  return @($candidates)
}

function Resolve-WikiTitle {
  param([Parameter(Mandatory = $true)][string]$Name)
  foreach ($candidate in (Get-WikiSearchCandidates $Name)) {
    try {
      $exactUrl = "https://starcitizen.tools/api.php?action=query&titles=$([uri]::EscapeDataString($candidate))&redirects=1&format=json&origin=*"
      $exactJson = (Get-UrlText $exactUrl) | ConvertFrom-Json
      $exactPages = @($exactJson.query.pages.PSObject.Properties | ForEach-Object { $_.Value })
      if ($exactPages.Count -gt 0 -and -not $exactPages[0].missing) {
        $exactTitle = Decode-Text $exactPages[0].title
        if ($exactTitle) { return $exactTitle }
      }
    } catch { }

    try {
      $searchUrl = "https://starcitizen.tools/api.php?action=query&list=search&srsearch=$([uri]::EscapeDataString($candidate))&srlimit=5&format=json&origin=*"
      $searchJson = (Get-UrlText $searchUrl) | ConvertFrom-Json
      foreach ($result in @($searchJson.query.search)) {
        $title = Decode-Text $result.title
        if ($title) { return $title }
      }
    } catch { }
  }
  return ""
}

function Get-WikiPageHtml {
  param([Parameter(Mandatory = $true)][string]$Name)
  $title = Resolve-WikiTitle $Name
  if ($title) {
    $parseUrl = "https://starcitizen.tools/api.php?action=parse&page=$([uri]::EscapeDataString($title))&prop=text&formatversion=2&format=json&origin=*"
    $parseJson = (Get-UrlText $parseUrl) | ConvertFrom-Json
    if ($parseJson.parse.text) { return [string]$parseJson.parse.text }
  }
  $slug = Get-WikiSlug $Name
  return Get-UrlText "https://starcitizen.tools/$slug"
}

function Get-WikiInfoboxSections {
  param([Parameter(Mandatory = $true)][string]$Html)
  $sections = @()
  $skipSections = @('metadata', 'external sites')

  $sectionMatches = [regex]::Matches(
    $Html,
    '<details\b[^>]*class="[^"]*\bt-infobox-section\b[^"]*"[^>]*>(?<body>.*?)</details>',
    [System.Text.RegularExpressions.RegexOptions]::Singleline
  )

  foreach ($sectionMatch in $sectionMatches) {
    $body = $sectionMatch.Groups['body'].Value
    $titleMatch = [regex]::Match(
      $body,
      '<div[^>]*class="[^"]*\bt-infobox-section-label\b[^"]*"[^>]*>(?<title>.*?)</div>',
      [System.Text.RegularExpressions.RegexOptions]::Singleline
    )
    $title = if ($titleMatch.Success) { Decode-Text $titleMatch.Groups['title'].Value } else { "" }
    if (-not $title) { $title = "Info" }
    if ($skipSections -contains ($title.ToLower().Trim())) { continue }

    $rows = @()
    foreach ($rowMatch in [regex]::Matches(
      $body,
      '<dt[^>]*class="[^"]*\bt-infobox-item-label\b[^"]*"[^>]*>(?<label>.*?)</dt>\s*<dd[^>]*class="[^"]*\bt-infobox-item-content\b[^"]*"[^>]*>(?<value>.*?)</dd>',
      [System.Text.RegularExpressions.RegexOptions]::Singleline
    )) {
      $label = Decode-Text $rowMatch.Groups['label'].Value
      $value = Decode-Text $rowMatch.Groups['value'].Value
      if (-not $label -or -not $value) { continue }
      $rows += [ordered]@{
        label = $label
        value = $value
      }
    }

    if ($rows.Count) {
      $sections += [ordered]@{
        title = $title
        rows = @($rows)
      }
    }
  }

  if ($sections.Count) { return @($sections) }

  $fallbackRows = @()
  foreach ($rowMatch in [regex]::Matches(
    $Html,
    '<div[^>]*class="infobox__label"[^>]*>(?<label>.*?)</div>\s*<div[^>]*class="infobox__data"[^>]*>(?<value>.*?)</div>',
    [System.Text.RegularExpressions.RegexOptions]::Singleline
  )) {
    $label = Decode-Text $rowMatch.Groups['label'].Value
    $value = Decode-Text $rowMatch.Groups['value'].Value
    if (-not $label -or -not $value) { continue }
    $fallbackRows += [ordered]@{
      label = $label
      value = $value
    }
  }

  if ($fallbackRows.Count) {
    $sections += [ordered]@{
      title = "General"
      rows = @($fallbackRows)
    }
  }

  return @($sections)
}

function Get-ItemPageData {
  param([Parameter(Mandatory = $true)][string]$Name)
  try {
    $html = Get-WikiPageHtml $Name
    $sections = @(Get-WikiInfoboxSections $html)
    if (-not $sections.Count) { return $null }
    return [ordered]@{
      pageSections = @($sections)
    }
  } catch {
    return $null
  }
}

function Get-ShipField {
  param(
    [Parameter(Mandatory = $true)][string]$Html,
    [Parameter(Mandatory = $true)][string]$Label
  )
  $pattern = '<div class="infobox__label">' + [regex]::Escape($Label) + '</div>\s*<div class="infobox__data">(?<value>.*?)</div>'
  $match = [regex]::Match($Html, $pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)
  if ($match.Success) { return Decode-Text $match.Groups['value'].Value }
  return ""
}

function Get-ShipManufacturer {
  param([Parameter(Mandatory = $true)][string]$Html)
  $manufacturer = ""
  try { $manufacturer = Get-ShipField -Html $Html -Label 'Manufacturer' } catch { $manufacturer = "" }
  if ($manufacturer) { return $manufacturer }

  $match = [regex]::Match($Html, '<div id="siteSub">(?<value>[^<]+)</div>', [System.Text.RegularExpressions.RegexOptions]::Singleline)
  if ($match.Success) {
    $siteSub = Decode-Text $match.Groups['value'].Value
    if ($siteSub -match '(?i)manufactured by\s+(?<value>.+)$') {
      return Decode-Text $Matches.value
    }
  }
  return ""
}

function Get-ShipStatus {
  param([Parameter(Mandatory = $true)][string]$Html)
  $match = [regex]::Match($Html, '<div class="infobox__indicators">.*?<div class="infobox__indicator[^"]*">.*?<div class="infobox__data">(?<status>.*?)</div>', [System.Text.RegularExpressions.RegexOptions]::Singleline)
  if ($match.Success) { return Decode-Text $match.Groups['status'].Value }
  return ""
}

function Normalize-ShipStatus {
  param([string]$Value)
  $text = Decode-Text $Value
  if (-not $text) { return "" }
  if ($text -match '(?i)\b(concept|greybox|pre-?production|prototype)\b') { return "Concept" }
  return $text
}

function Get-ShipDimensions {
  param([Parameter(Mandatory = $true)][string]$Html)
  $match = [regex]::Match($Html, '<div class="t-dimensions[^"]*"[^>]*data-length="(?<length>[^"]+)"[^>]*data-width="(?<width>[^"]+)"[^>]*data-height="(?<height>[^"]+)"[^>]*>.*?<span class="t-dimensions-footer-value">(?<mass>[^<]+)</span>', [System.Text.RegularExpressions.RegexOptions]::Singleline)
  if ($match.Success) {
    return [ordered]@{
      length = Decode-Text $match.Groups['length'].Value
      width = Decode-Text $match.Groups['width'].Value
      height = Decode-Text $match.Groups['height'].Value
      mass = Decode-Text $match.Groups['mass'].Value
    }
  }
  return [ordered]@{ length = ""; width = ""; height = ""; mass = "" }
}

function Normalize-ShipSize {
  param([string]$Value)
  $text = Decode-Text $Value
  if ($text -match '^(?<size>Small|Medium|Large|Capital|Snub)\b') {
    return $Matches.size
  }
  if ($text -match '(?i)\bvehicle\b') { return 'Vehicle' }
  return $text
}

function Get-HtmlAttributeValue {
  param(
    [Parameter(Mandatory = $true)][string]$Html,
    [Parameter(Mandatory = $true)][string]$Attribute
  )
  $match = [regex]::Match($Html, '(?i)\b' + [regex]::Escape($Attribute) + '="(?<value>[^"]*)"')
  if ($match.Success) { return Decode-Text $match.Groups['value'].Value }
  return ""
}

function Get-TableBlock {
  param(
    [Parameter(Mandatory = $true)][string]$Html,
    [Parameter(Mandatory = $true)][string]$Title
  )
  $pattern = [regex]::Escape('<div class="t-card__title"><span aria-hidden="true">') + '.*?' + [regex]::Escape($Title) + '</div>.*?<table class="t-table wikitable wikitable--fluid sortable">(?<table>.*?)</table>'
  $match = [regex]::Match($Html, $pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)
  if ($match.Success) { return $match.Groups['table'].Value }
  return ""
}

function Get-ShipPortsHtml {
  param([Parameter(Mandatory = $true)][string]$Html)
  $portsIndex = $Html.IndexOf('<h2 id="Ports">')
  if ($portsIndex -lt 0) { return "" }
  $tail = $Html.Substring($portsIndex)
  $stopIndex = $tail.IndexOf('<h2 id="Model">')
  if ($stopIndex -lt 0) { $stopIndex = $tail.IndexOf('<h2 id="Acquisition">') }
  if ($stopIndex -lt 0) { $stopIndex = $tail.Length }
  return $tail.Substring(0, $stopIndex)
}

function Get-ShipLoadoutSectionMatches {
  param([Parameter(Mandatory = $true)][string]$PortsHtml)
  $matches = @()
  $pattern = '<div class="t-card__title">(?<card>[^<]+)</div>|<div class="t-entity-ports-subcat"[^>]*>(?<sub>[^<]+)</div>'
  foreach ($match in [regex]::Matches($PortsHtml, $pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)) {
    $title = ""
    if ($match.Groups['card'].Success) {
      $title = Decode-Text $match.Groups['card'].Value
    } elseif ($match.Groups['sub'].Success) {
      $title = Decode-Text $match.Groups['sub'].Value
    }
    if (-not $title) { continue }
    $matches += [pscustomobject]@{
      Index = $match.Index
      Length = $match.Length
      Title = $title
    }
  }
  return @($matches)
}

function Get-ShipLoadoutGroups {
  param([Parameter(Mandatory = $true)][string]$Html)
  $groups = New-Object System.Collections.Generic.List[string]
  $portsHtml = Get-ShipPortsHtml $Html
  if (-not $portsHtml) { return @() }
  foreach ($section in @(Get-ShipLoadoutSectionMatches $portsHtml)) {
    if ($section.Title -and -not $groups.Contains($section.Title)) { [void]$groups.Add($section.Title) }
  }
  return @($groups)
}

function Get-ShipLoadoutData {
  param([Parameter(Mandatory = $true)][string]$Html)
  $sections = @()
  $portsHtml = Get-ShipPortsHtml $Html
  if (-not $portsHtml) { return @() }

  $sectionMatches = @(Get-ShipLoadoutSectionMatches $portsHtml)
  if (-not $sectionMatches.Count) { return @() }

  for ($s = 0; $s -lt $sectionMatches.Count; $s++) {
    $sectionMatch = $sectionMatches[$s]
    $title = $sectionMatch.Title
    if (-not $title) { continue }
    $sectionStart = $sectionMatch.Index + $sectionMatch.Length
    $sectionEnd = if (($s + 1) -lt $sectionMatches.Count) { $sectionMatches[$s + 1].Index } else { $portsHtml.Length }
    if ($sectionEnd -lt $sectionStart) { continue }
    $sectionHtml = $portsHtml.Substring($sectionStart, $sectionEnd - $sectionStart)
    $items = @()
    foreach ($rowMatch in [regex]::Matches($sectionHtml, '<(?:div|li)\b[^>]*data-port-category="[^"]*"[^>]*>', [System.Text.RegularExpressions.RegexOptions]::Singleline)) {
      $rowHtml = $rowMatch.Value
      $category = Get-HtmlAttributeValue -Html $rowHtml -Attribute 'data-port-category'
      $typeText = Get-HtmlAttributeValue -Html $rowHtml -Attribute 'data-port-type'
      $subtypeText = Get-HtmlAttributeValue -Html $rowHtml -Attribute 'data-port-subtype'
      $name = Get-HtmlAttributeValue -Html $rowHtml -Attribute 'data-equipped-name'
      $count = 1
      $countText = Get-HtmlAttributeValue -Html $rowHtml -Attribute 'data-port-count'
      if ($countText -match '^\d+$') { $count = [Math]::Max(1, [int]$countText) }
      if (-not $name) {
        $labelMatch = [regex]::Match($rowHtml, '<span class="t-entity-ports-label">(?<label>.*?)</span>', [System.Text.RegularExpressions.RegexOptions]::Singleline)
        if ($labelMatch.Success) { $name = Decode-Text $labelMatch.Groups['label'].Value }
      }
      if (-not $name) { continue }
      if ($name -match '^(?:Controller_|hardpoint_.*)$') { continue }
      if ($name -match '^(?:POWER|HEAT|SHIELDS|COMMS|MISSILES|WEAPONS|LIGHTS|SECURITY)$') { continue }
      if ($typeText -match '(?i)Controller|SeatAccess|AirTraffic|DockingAnimator|DockingCollar|DoorController|FuelController') { continue }
      for ($n = 0; $n -lt $count; $n++) { $items += $name }
    }
    $sections += [ordered]@{ title = $title; items = @($items) }
  }

  return @($sections)
}

function Is-BuyableShipComponentSection {
  param([string]$Title)
  $value = ""
  if ($Title) { $value = Decode-Text $Title }
  if (-not $value) { return $false }
  return $value -match '(?i)\b(Coolers?|Power Plants?|Quantum Drives?|Shields?|Shield Generators?|Mining|Salvage|Tractor)\b'
}

function Is-UtilityShipComponentName {
  param([string]$Name)
  $value = ""
  if ($Name) { $value = Decode-Text $Name }
  if (-not $value) { return $false }
  return $value -match '(?i)\b(Mining Laser|Mining Head|Salvage|Scraper|Tractor Beam|Tractor Module|Tractor)\b'
}

function Get-ShipAcquisitionOffers {
  param([Parameter(Mandatory = $true)][string]$Html)
  $offers = @()
  foreach ($title in @('Shops', 'Rentals')) {
    $tableHtml = Get-TableBlock -Html $Html -Title $title
    if (-not $tableHtml) { continue }
    $rows = @(Get-TableRows $tableHtml)
    foreach ($row in $rows) {
      if ($row.Cells.Count -lt 3) { continue }
      if ($row.Cells[0] -eq 'System') { continue }
      if ($title -eq 'Shops') {
        $systemText = Decode-Text $row.Cells[0]
        $locationText = Decode-Text $row.Cells[1]
        $priceText = [regex]::Replace($row.Cells[2], '[^\d]', '')
        if (-not $locationText) { continue }
        $offers += [ordered]@{
          location = $locationText
          locationLabel = $locationText
          system = Normalize-System $locationText
          area = Normalize-Area $locationText
          price = [int]($priceText)
        }
      } elseif ($title -eq 'Rentals') {
        if ($row.Cells.Count -lt 6) { continue }
        $systemText = Decode-Text $row.Cells[0]
        $locationText = Decode-Text $row.Cells[1]
        $oneDay = [int]([regex]::Replace($row.Cells[3], '[^\d]', ''))
        $threeDays = [int]([regex]::Replace($row.Cells[4], '[^\d]', ''))
        $sevenDays = [int]([regex]::Replace($row.Cells[5], '[^\d]', ''))
        if (-not $locationText) { continue }
        $offers += [ordered]@{
          location = $locationText
          locationLabel = $locationText
          system = Normalize-System $locationText
          area = Normalize-Area $locationText
          oneDay = $oneDay
          threeDays = $threeDays
          sevenDays = $sevenDays
        }
      }
    }
  }
  return @($offers)
}

function Get-ShipPageData {
  param([Parameter(Mandatory = $true)][string]$Name)
  try {
    $html = Get-ShipPageHtml $Name
    $manufacturer = ""
    $career = ""
    $role = ""
    $size = ""
    $crew = ""
    $cargo = ""
    $status = ""
    $dimensions = [ordered]@{ length = ""; width = ""; height = ""; mass = "" }
    $loadoutSections = @()
    try { $manufacturer = Get-ShipManufacturer $html } catch { }
    try { $career = Get-ShipField -Html $html -Label 'Career' } catch { }
    try { $role = Get-ShipField -Html $html -Label 'Role' } catch { }
    try { $size = Normalize-ShipSize (Get-ShipField -Html $html -Label 'Size') } catch { }
    try { $crew = Get-ShipField -Html $html -Label 'Crew' } catch { }
    try { $cargo = Get-ShipField -Html $html -Label 'Cargo' } catch { }
    try { $status = Normalize-ShipStatus (Get-ShipStatus $html) } catch { $status = "" }
    try { $dimensions = Get-ShipDimensions $html } catch { }
    try { $loadoutSections = @(Get-ShipLoadoutData $html) } catch { $loadoutSections = @() }
    $loadoutGroups = @($loadoutSections | ForEach-Object { $_.title })
    $loadoutWeapons = @()
    $loadoutComponents = @()
    foreach ($section in $loadoutSections) {
      $items = @($section.items)
      if ($section.title -match 'Weapons?|Turrets?|Missile|Bomb') {
        foreach ($item in $items) {
          if (Is-UtilityShipComponentName $item) {
            $loadoutComponents += $item
          } else {
            $loadoutWeapons += $item
          }
        }
      } elseif (Is-BuyableShipComponentSection $section.title) {
        $loadoutComponents += $items
      }
    }
    $offers = @()
    try { $offers = @(Get-ShipAcquisitionOffers $html) } catch { $offers = @() }
    $shopOffer = $offers | Where-Object { $_.price -and $_.price -gt 0 } | Select-Object -First 1
    $rentals = $offers | Where-Object { $_.oneDay -or $_.threeDays -or $_.sevenDays }
    return [ordered]@{
      manufacturer = $manufacturer
      career = $career
      role = $role
      size = $size
      status = $status
      crew = $crew
      cargo = $cargo
      length = $dimensions.length
      width = $dimensions.width
      height = $dimensions.height
      mass = $dimensions.mass
      loadoutCategories = $loadoutGroups
      loadoutWeapons = @($loadoutWeapons)
      loadoutComponents = @($loadoutComponents)
      offers = @($offers | Where-Object { $_.price })
      rentals = @($rentals)
      buyPrice = if ($shopOffer) { [int]$shopOffer.price } else { $null }
    }
  } catch {
    Write-Warning ("Skipping ship page: {0} :: {1}" -f $Name, $_.Exception.Message)
    return $null
  }
}

function Get-TableRows {
  param([Parameter(Mandatory = $true)][string]$Html)
  $rows = [regex]::Matches($Html, '<tr[^>]*>(.*?)</tr>', [System.Text.RegularExpressions.RegexOptions]::Singleline)
  foreach ($row in $rows) {
    $cells = [regex]::Matches($row.Groups[1].Value, '<t[dh][^>]*>(.*?)</t[dh]>', [System.Text.RegularExpressions.RegexOptions]::Singleline)
    $values = @()
    foreach ($cell in $cells) {
      $values += (Decode-Text $cell.Groups[1].Value)
    }
    [pscustomobject]@{
      Raw = $row.Groups[1].Value
      Cells = $values
    }
  }
}

function Normalize-System {
  param([string]$Title)
  switch -Regex ($Title) {
    'Area\s*18' { return 'Stanton' }
    'Levski' { return 'Nyx' }
    'Lorville' { return 'Stanton' }
    'New Babbage' { return 'Stanton' }
    'Orison' { return 'Stanton' }
    'Ruin Station' { return 'Pyro' }
    'Cargo Deck' { return 'Stanton' }
    'Refinery Deck' { return 'Stanton' }
    default { return 'Other' }
  }
}

function Normalize-Area {
  param([string]$Title)
  switch -Regex ($Title) {
    'Area\s*18' { return 'ArcCorp' }
    'Levski' { return 'Levski' }
    'Lorville' { return 'Hurston' }
    'New Babbage' { return 'microTech' }
    'Orison' { return 'Crusader' }
    'Ruin Station' { return 'Ruin Station' }
    'Cargo Deck' { return 'Station' }
    'Refinery Deck' { return 'Station' }
    default { return $Title }
  }
}

function Escape-JsonForJs {
  param([Parameter(Mandatory = $true)]$Object)
  return ($Object | ConvertTo-Json -Depth 14 -Compress)
}

function Parse-LocationParts {
  param([Parameter(Mandatory = $true)][string]$Location)
  $parts = $Location -split ' - '
  $system = if ($parts.Count -gt 0) { $parts[0].Trim() } else { "Other" }
  $area = if ($parts.Count -gt 1) { $parts[1].Trim() } else { "Other" }
  if ($system -match '^(.*?)\s*>\s*(.+)$') {
    $system = $matches[1].Trim()
    $area = $matches[2].Trim()
  }
  return [ordered]@{
    system = if ($system) { $system } else { "Other" }
    area = if ($area) { $area } else { "Other" }
    locationPath = if ($parts.Count -gt 2) { ($parts[2..($parts.Count - 1)] -join ' - ').Trim() } else { "" }
  }
}

function Normalize-ShipKey {
  param([Parameter(Mandatory = $true)][string]$Value)
  return ([string]$Value).Trim().ToLowerInvariant()
}

function Get-WikiCategoryMembers {
  param([Parameter(Mandatory = $true)][string]$CategoryTitle)
  $members = New-Object System.Collections.ArrayList
  $seen = @{}
  $queue = New-Object System.Collections.ArrayList
  [void]$queue.Add([string]$CategoryTitle)

  for ($q = 0; $q -lt $queue.Count; $q++) {
    $current = [string]$queue[$q]
    $continue = $null
    do {
      $url = "https://starcitizen.tools/api.php?action=query&list=categorymembers&cmtitle=$([uri]::EscapeDataString([string]$current))&cmtype=page|subcat&cmlimit=max&format=json"
      if ($continue) { $url += "&cmcontinue=$([uri]::EscapeDataString($continue))" }
      $json = Get-UrlText $url | ConvertFrom-Json
      foreach ($member in @($json.query.categorymembers)) {
        $title = Decode-Text ([string]$member.title)
        if (-not $title) { continue }
        if ($member.ns -eq 14) {
          if (-not $seen.ContainsKey("cat::$title")) {
            $seen["cat::$title"] = $true
            [void]$queue.Add($title)
          }
          continue
        }
        if ($seen.ContainsKey("page::$title")) { continue }
        $seen["page::$title"] = $true
        [void]$members.Add($title)
      }
      $continue = $null
      if ($json.continue -and $json.continue.cmcontinue) { $continue = [string]$json.continue.cmcontinue }
    } while ($continue)
  }

  return @($members)
}

function Get-WikiShipTitles {
  $titles = New-Object System.Collections.ArrayList
  foreach ($category in @('Category:Ships', 'Category:Ground vehicles')) {
    foreach ($title in @(Get-WikiCategoryMembers $category)) {
      if ($title) { [void]$titles.Add($title) }
    }
  }
  return @($titles | Sort-Object -Unique)
}

Write-Host "Fetching CStone location index..."
$rootHtml = Get-UrlText "https://finder.cstone.space/"
$headingIndex = $rootHtml.IndexOf('ITEMS BY LOCATION:')
if ($headingIndex -lt 0) {
  Set-Content -LiteralPath (Join-Path $env:TEMP "cstone-build-debug.html") -Value $rootHtml
  throw "Could not find location selector on finder.cstone.space."
}
$selectStart = $rootHtml.IndexOf('<select', $headingIndex)
if ($selectStart -lt 0) {
  throw "Could not find location selector on finder.cstone.space."
}
$selectEnd = $rootHtml.IndexOf('</select>', $selectStart)
if ($selectEnd -lt 0) {
  throw "Could not find location selector on finder.cstone.space."
}
$locationBody = $rootHtml.Substring($selectStart, $selectEnd - $selectStart)

  $locations = [regex]::Matches($locationBody, '<option[^>]*>(?<value>.*?)</option>', ([System.Text.RegularExpressions.RegexOptions]::Singleline -bor [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)) | ForEach-Object {
  Decode-Text $_.Groups['value'].Value
}

$itemsById = @{}

Write-Host "Fetching CStone search index..."
$searchIndex = @(Get-UrlText "https://finder.cstone.space/GetSearch" | ConvertFrom-Json)
foreach ($row in $searchIndex) {
  if (-not $row.id -or -not $row.name) { continue }
  $soldCount = [int](($row.Sold | Select-Object -First 1) -as [string] -replace '[^\d]', '')
  if (-not $itemsById.ContainsKey($row.id)) {
    $itemsById[$row.id] = [ordered]@{
      id = $row.id
      name = [string]$row.name
      type = "Unknown"
      subtype = "Unknown"
      sold = $soldCount
      offers = @()
    }
  } else {
    $itemsById[$row.id].sold = $soldCount
  }
}

$index = 0
foreach ($location in $locations) {
  $index++
  Write-Progress -Activity "Fetching CStone inventory" -Status $location -PercentComplete (($index / [double]$locations.Count) * 100)
  try {
    $encoded = [uri]::EscapeDataString($location)
    $jsonText = Get-UrlText "https://finder.cstone.space/GetLocation/$encoded"
    $rows = $jsonText | ConvertFrom-Json
    foreach ($row in $rows) {
      if (-not $row.ItemId -or -not $row.name) { continue }
      $typeParts = ([string]$row.type).Split('/', 2)
      $category = ($typeParts[0] | ForEach-Object { $_.Trim() })
      $subtype = if ($typeParts.Count -gt 1) { $typeParts[1].Trim() } else { "" }
      if (-not $itemsById.ContainsKey($row.ItemId)) {
        $itemsById[$row.ItemId] = [ordered]@{
          id = $row.ItemId
          name = [string]$row.name
          type = $category
          subtype = $subtype
          offers = @()
        }
      }
      $parsedLocation = Parse-LocationParts $location
      $itemsById[$row.ItemId].offers += [ordered]@{
        location = $location
        system = $parsedLocation.system
        area = $parsedLocation.area
        locationPath = $parsedLocation.locationPath
        price = [int]$row.price
      }
      $itemsById[$row.ItemId].sold = 1
    }
  } catch {
    Write-Warning "Skipping location: $location"
  }
}

$itemEntries = $itemsById.Values | Sort-Object name

Write-Host "Fetching item page metadata..."
for ($i = 0; $i -lt $itemEntries.Count; $i++) {
  $entry = $itemEntries[$i]
  if (-not $entry.name) { continue }
  Write-Progress -Activity "Fetching item pages" -Status $entry.name -PercentComplete (($i / [double][Math]::Max(1, $itemEntries.Count)) * 100)
  $page = Get-ItemPageData $entry.name
  if (-not $page) { continue }
  if ($page.pageSections -and $page.pageSections.Count) { $entry.pageSections = @($page.pageSections) }
  $itemEntries[$i] = $entry
}

Write-Host "Fetching ship purchase tables..."
$purchaseHtml = Get-UrlText "https://starcitizen.tools/Purchasing_ships"
$purchaseRows = @(Get-TableRows $purchaseHtml)
$purchaseHeader = $purchaseRows | Where-Object { $_.Cells.Count -ge 4 -and $_.Cells[0] -eq 'Manufacturer' } | Select-Object -First 1
if (-not $purchaseHeader) { throw "Could not find purchasing ships table header." }
$purchaseLocations = $purchaseHeader.Cells | Select-Object -Skip 3
$purchaseMap = @{
  'Area18' = @{ system = 'Stanton'; area = 'ArcCorp' }
  'Levski' = @{ system = 'Nyx'; area = 'Levski' }
  'Lorville' = @{ system = 'Stanton'; area = 'Hurston' }
  'New Babbage' = @{ system = 'Stanton'; area = 'microTech' }
  'Orison' = @{ system = 'Stanton'; area = 'Crusader' }
  'Cargo Deck' = @{ system = 'Stanton'; area = 'Station' }
  'Refinery Deck' = @{ system = 'Stanton'; area = 'Station' }
  'Buy & Fly' = @{ system = 'Pyro'; area = 'Ruin Station' }
}

$shipEntries = New-Object System.Collections.Generic.List[object]
$currentManufacturer = ''
foreach ($row in $purchaseRows) {
  if ($row.Cells.Count -lt 3) { continue }
  if ($row.Cells[0] -eq 'Manufacturer') { continue }
  if ($row.Cells[0] -eq 'Ship') { continue }
  $cells = $row.Cells
  if ($cells.Count -eq (3 + $purchaseLocations.Count)) {
    $currentManufacturer = $cells[0]
    $ship = $cells[1]
    $basePrice = $cells[2]
    $locationCells = $cells | Select-Object -Skip 3
  } elseif ($cells.Count -eq (2 + $purchaseLocations.Count)) {
    $ship = $cells[0]
    $basePrice = $cells[1]
    $locationCells = $cells | Select-Object -Skip 2
  } else {
    continue
  }

  if (-not $ship) { continue }
  $offers = @()
  for ($i = 0; $i -lt $locationCells.Count; $i++) {
    if ($locationCells[$i] -ne '✔') { continue }
    $locName = $purchaseLocations[$i]
    $meta = $purchaseMap[$locName]
    $offers += [ordered]@{
      location = $locName
      system = if ($meta) { $meta.system } else { 'Other' }
      area = if ($meta) { $meta.area } else { $locName }
      locationLabel = $locName
    }
  }
  $shipEntries.Add([ordered]@{
      id = ("ship::" + ((($ship + '|' + $currentManufacturer) -replace '[^a-zA-Z0-9]+', '-').ToLower()))
    name = $ship
    manufacturer = $currentManufacturer
    role = ""
    basePrice = [int]([regex]::Replace($basePrice, '[^\d]', ''))
    offers = $offers
  })
}

Write-Host "Seeding ship titles from wiki categories..."
$wikiShipTitles = @(Get-WikiShipTitles)
$shipNameSet = New-Object 'System.Collections.Generic.HashSet[string]'
foreach ($entry in $shipEntries) {
  if ($entry.name) { [void]$shipNameSet.Add((Normalize-ShipKey $entry.name)) }
}
foreach ($title in $wikiShipTitles) {
  if (-not $title) { continue }
  $normalizedTitle = Normalize-ShipKey $title
  if ($shipNameSet.Contains($normalizedTitle)) { continue }
  [void]$shipNameSet.Add($normalizedTitle)
  $shipEntries.Add([ordered]@{
    id = ("ship::" + (($title -replace '[^a-zA-Z0-9]+', '-').ToLower()))
    name = $title
    manufacturer = ""
    career = ""
    role = ""
    size = ""
    status = ""
    crew = ""
    cargo = ""
    length = ""
    width = ""
    height = ""
    mass = ""
    loadoutCategories = @()
    loadoutWeapons = @()
    loadoutComponents = @()
    offers = @()
  })
}

Write-Host "Fetching ship page metadata..."
for ($i = 0; $i -lt $shipEntries.Count; $i++) {
  $entry = $shipEntries[$i]
  Write-Progress -Activity "Fetching ship pages" -Status $entry.name -PercentComplete (($i / [double][Math]::Max(1, $shipEntries.Count)) * 100)
  $page = Get-ShipPageData $entry.name
  if (-not $page) { continue }
  $hasUsefulPageData = ($page.manufacturer -or $page.career -or $page.role -or $page.size -or $page.status -or $page.crew -or $page.cargo -or ($page.loadoutCategories -and $page.loadoutCategories.Count) -or ($page.loadoutWeapons -and $page.loadoutWeapons.Count) -or ($page.loadoutComponents -and $page.loadoutComponents.Count) -or ($page.offers -and $page.offers.Count) -or $page.buyPrice)
  if (-not $hasUsefulPageData -and -not ($entry.offers -and $entry.offers.Count)) {
    continue
  }
  if ($page.manufacturer) { $entry.manufacturer = $page.manufacturer }
  if ($page.career) { $entry.career = $page.career }
  if ($page.role) { $entry.role = $page.role }
  if ($page.size) { $entry.size = $page.size }
  if ($page.status) { $entry.status = $page.status }
  if ($page.crew) { $entry.crew = $page.crew }
  if ($page.cargo) { $entry.cargo = $page.cargo }
  if ($page.length) { $entry.length = $page.length }
  if ($page.width) { $entry.width = $page.width }
  if ($page.height) { $entry.height = $page.height }
  if ($page.mass) { $entry.mass = $page.mass }
  if ($page.loadoutCategories) { $entry.loadoutCategories = @($page.loadoutCategories) }
  if ($page.loadoutWeapons) { $entry.loadoutWeapons = @($page.loadoutWeapons) }
  if ($page.loadoutComponents) { $entry.loadoutComponents = @($page.loadoutComponents) }
  if ($page.offers -and $page.offers.Count) { $entry.offers = @($page.offers) }
  if ($page.buyPrice) { $entry.basePrice = [int]$page.buyPrice }
  $shipEntries[$i] = $entry
}

$shipEntries = @($shipEntries | Where-Object {
  $_.name -and (
    $_.career -or $_.role -or $_.size -or $_.status -or $_.manufacturer -or $_.basePrice -or
    ($_.offers -and $_.offers.Count) -or ($_.loadoutCategories -and $_.loadoutCategories.Count) -or
    ($_.loadoutWeapons -and $_.loadoutWeapons.Count) -or ($_.loadoutComponents -and $_.loadoutComponents.Count)
  )
})

Write-Host "Fetching ship rental tables..."
$rentalHtml = Get-UrlText "https://starcitizen.tools/Ship_renting"
  $rentalSections = [regex]::Matches($rentalHtml, '<div class="mw-heading mw-heading4"><h4 id="(?<id>[^"]+)">(?<title>.*?)</h4>.*?<table class="wikitable">(?<table>.*?)</table>', [System.Text.RegularExpressions.RegexOptions]::Singleline)
$rentalEntries = @{}
foreach ($section in $rentalSections) {
  $title = Decode-Text $section.Groups['title'].Value
  $system = Normalize-System $title
  $area = Normalize-Area $title
  $tableRows = @(Get-TableRows $section.Groups['table'].Value)
  foreach ($row in $tableRows) {
    if ($row.Cells.Count -lt 5) { continue }
    if ($row.Cells[0] -eq 'Manufacturer') { continue }
    if ($row.Cells[1] -eq 'Ship') { continue }
    $manufacturer = $row.Cells[0]
    $ship = $row.Cells[1]
    $role = $row.Cells[2]
    $p1 = [int]([regex]::Replace($row.Cells[3], '[^\d]', ''))
    $p3 = [int]([regex]::Replace($row.Cells[4], '[^\d]', ''))
    $p7 = [int]([regex]::Replace($row.Cells[5], '[^\d]', ''))
    $key = "$manufacturer|$ship|$role"
    if (-not $rentalEntries.ContainsKey($key)) {
      $rentalEntries[$key] = [ordered]@{
        id = ("rental::" + (($key -replace '[^a-zA-Z0-9]+', '-').ToLower()))
        name = $ship
        manufacturer = $manufacturer
        role = $role
        prices = [ordered]@{ oneDay = $p1; threeDays = $p3; sevenDays = $p7 }
        offers = @()
      }
    }
    $rentalEntries[$key].offers += [ordered]@{
      location = $title
      locationLabel = $title
      system = $system
      area = $area
      oneDay = $p1
      threeDays = $p3
      sevenDays = $p7
    }
  }
}

$isMalformedBuyEntry = {
  param($entry)
  $name = ""
  if ($null -ne $entry.name -and [string]$entry.name) { $name = [string]$entry.name }
  elseif ($null -ne $entry.title -and [string]$entry.title) { $name = [string]$entry.title }
  $type = ""
  if ($null -ne $entry.type) { $type = ([string]$entry.type).Trim().ToLowerInvariant() }
  $subtype = ""
  if ($null -ne $entry.subtype) { $subtype = ([string]$entry.subtype).Trim().ToLowerInvariant() }
  $offerCount = if ($entry.offers -and $entry.offers.Count) { [int]$entry.offers.Count } else { 0 }
  return ($name.Length -gt 1000) -or (($offerCount -eq 0) -and ($type -eq "unknown") -and ($subtype -eq "unknown") -and ($name.Length -gt 200))
}

$payload = [ordered]@{
  generatedAt = (Get-Date).ToString("o")
  items = @($itemEntries | Where-Object { -not (& $isMalformedBuyEntry $_) } | ForEach-Object { $_ })
  ships = @($shipEntries | Where-Object { -not (& $isMalformedBuyEntry $_) })
  rentals = @($rentalEntries.GetEnumerator() | ForEach-Object { $_.Value } | Where-Object { -not (& $isMalformedBuyEntry $_) })
}

$js = "window.BUY_ITEMS_DATA = " + (Escape-JsonForJs $payload) + ";"
Set-Content -LiteralPath $OutputPath -Value $js -Encoding UTF8
Write-Host "Wrote $OutputPath"

$outputDir = Split-Path -Parent $OutputPath
$shipPartsPath = Join-Path $outputDir "buy_items_ships_data.js"
$rentalPartsPath = Join-Path $outputDir "buy_items_rentals_data.js"

$shipPartsJs = "window.BUY_ITEMS_DATA_PARTS = window.BUY_ITEMS_DATA_PARTS || {};`nwindow.BUY_ITEMS_DATA_PARTS.ships = " + (Escape-JsonForJs ([ordered]@{ ships = @($shipEntries | Where-Object { -not (& $isMalformedBuyEntry $_) }) })) + ";"
$rentalPartsJs = "window.BUY_ITEMS_DATA_PARTS = window.BUY_ITEMS_DATA_PARTS || {};`nwindow.BUY_ITEMS_DATA_PARTS.rentals = " + (Escape-JsonForJs ([ordered]@{ rentals = @($rentalEntries.GetEnumerator() | ForEach-Object { $_.Value } | Where-Object { -not (& $isMalformedBuyEntry $_) }) })) + ";"

Set-Content -LiteralPath $shipPartsPath -Value $shipPartsJs -Encoding UTF8
Set-Content -LiteralPath $rentalPartsPath -Value $rentalPartsJs -Encoding UTF8
Write-Host "Wrote $shipPartsPath"
Write-Host "Wrote $rentalPartsPath"

