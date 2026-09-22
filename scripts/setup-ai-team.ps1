<#
.SYNOPSIS
    Links OpsNow's .claude/{agents,rules,skills} to a local checkout of the
    shared AI-Software-Team framework, without duplicating its files into
    this repository.

.DESCRIPTION
    OpsNow's Claude Code engineering framework (agent roles, engineering
    rules, workflow skills) is maintained in a separate repository and
    consumed here via local Windows directory junctions. This script creates
    or repairs those three junctions.

    It never copies framework files into OpsNow, never touches Git, never
    overwrites a real directory, and is safe to run repeatedly.

    Directory junctions (not symbolic links) are used deliberately: creating
    a real Windows directory symbolic link requires Administrator privilege
    or Developer Mode enabled, while a junction needs neither and behaves
    identically for this purpose (a live, local, read-through link).

.PARAMETER TeamPath
    Path to the shared AI-Software-Team checkout. Defaults to this
    developer's local path; pass your own if your checkout lives elsewhere.

.EXAMPLE
    .\scripts\setup-ai-team.ps1

.EXAMPLE
    .\scripts\setup-ai-team.ps1 -TeamPath "C:\Projects\AI-Software-Team-V2"
#>

param(
    [string]$TeamPath = "D:\Projects\Claude\AI-Software-Team-V2"
)

$ErrorActionPreference = "Stop"

$RepoRoot  = Split-Path -Parent $PSScriptRoot
$ClaudeDir = Join-Path $RepoRoot ".claude"
$LinkNames = @("agents", "rules", "skills")

$results = [System.Collections.Generic.List[object]]::new()

function Add-Result($Name, $Pass, $Detail) {
    $results.Add([pscustomobject]@{ Name = $Name; Pass = $Pass; Detail = $Detail })
}

Write-Output "OpsNow AI-team setup"
Write-Output "  Team source : $TeamPath"
Write-Output "  OpsNow repo : $RepoRoot"
Write-Output ""

# --- 1. Validate the team source -------------------------------------------

if (-not (Test-Path -LiteralPath $TeamPath -PathType Container)) {
    Add-Result "TeamPath exists" $false "Not found: $TeamPath"
    Write-Output "FAIL  TeamPath exists -- $TeamPath"
    Write-Output ""
    Write-Output "Cannot continue without a valid team source. Pass -TeamPath if your"
    Write-Output "checkout lives somewhere other than the default."
    exit 1
}
Add-Result "TeamPath exists" $true $TeamPath

$requiredEntries = @(
    @{ Path = "CLAUDE.md";      Type = "Leaf" },
    @{ Path = ".claude\agents"; Type = "Container" },
    @{ Path = ".claude\rules";  Type = "Container" },
    @{ Path = ".claude\skills"; Type = "Container" }
)

$missing = @()
foreach ($entry in $requiredEntries) {
    $full = Join-Path $TeamPath $entry.Path
    if (-not (Test-Path -LiteralPath $full -PathType $entry.Type)) {
        $missing += $entry.Path
    }
}

if ($missing.Count -gt 0) {
    Add-Result "TeamPath structure" $false "Missing: $($missing -join ', ')"
    Write-Output "FAIL  TeamPath structure -- missing: $($missing -join ', ')"
    exit 1
}
Add-Result "TeamPath structure" $true "CLAUDE.md, .claude\agents, .claude\rules, .claude\skills all present"

if (-not (Test-Path -LiteralPath $ClaudeDir -PathType Container)) {
    Write-Output "FAIL  OpsNow .claude directory not found at $ClaudeDir"
    exit 1
}

# --- 2. Link each of agents/rules/skills ------------------------------------

foreach ($name in $LinkNames) {
    $linkPath   = Join-Path $ClaudeDir $name
    $targetPath = Join-Path $TeamPath ".claude\$name"

    if (Test-Path -LiteralPath $linkPath) {
        $item = Get-Item -LiteralPath $linkPath -Force
        $isReparsePoint = ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0

        if (-not $isReparsePoint) {
            # A real directory (or file) here is developer content -- never touch it.
            Add-Result $name $false "Refusing to touch: $linkPath is a real directory/file, not a link"
            Write-Output "FAIL  $name -- $linkPath is a real directory/file; left untouched"
            continue
        }

        $currentTarget = $null
        try {
            $raw = fsutil reparsepoint query $linkPath 2>$null
            $line = $raw | Select-String "Substitute Name:\s*\\\?\?\\(.+)$"
            if ($line) { $currentTarget = $line.Matches[0].Groups[1].Value }
        } catch { }

        if ($currentTarget -and ($currentTarget.TrimEnd('\') -ieq $targetPath.TrimEnd('\'))) {
            Add-Result $name $true "Already correctly linked -> $targetPath"
            Write-Output "PASS  $name -- already correctly linked -> $targetPath"
            continue
        }

        # Existing link is stale/broken/pointing elsewhere: replace the link
        # object only. [System.IO.Directory]::Delete($path, $false) removes
        # just the reparse point, never the target's contents, and (unlike
        # Remove-Item) never raises PowerShell's unsuppressible "item has
        # children" confirmation prompt in a non-interactive host.
        [System.IO.Directory]::Delete($linkPath, $false)
    }

    try {
        New-Item -ItemType Junction -Path $linkPath -Target $targetPath -ErrorAction Stop | Out-Null
    } catch {
        Add-Result $name $false "Failed to create junction: $($_.Exception.Message)"
        Write-Output "FAIL  $name -- failed to create junction: $($_.Exception.Message)"
        continue
    }

    # --- 3. Verify the result ------------------------------------------------

    $resolved = Test-Path -LiteralPath $linkPath -PathType Container
    $childCount = 0
    if ($resolved) {
        $childCount = (Get-ChildItem -LiteralPath $linkPath -Force -ErrorAction SilentlyContinue | Measure-Object).Count
    }

    if ($resolved -and $childCount -gt 0) {
        Add-Result $name $true "Linked and resolves -> $targetPath ($childCount entries)"
        Write-Output "PASS  $name -- linked and resolves -> $targetPath ($childCount entries)"
    } else {
        Add-Result $name $false "Created but does not resolve to readable content -> $targetPath"
        Write-Output "FAIL  $name -- created but does not resolve to readable content"
    }
}

# --- 4. Summary --------------------------------------------------------------

Write-Output ""
Write-Output "Summary:"
foreach ($r in $results) {
    $status = if ($r.Pass) { "PASS" } else { "FAIL" }
    Write-Output ("  {0,-20} {1,-4} {2}" -f $r.Name, $status, $r.Detail)
}

$failed = @($results | Where-Object { -not $_.Pass })
if ($failed.Count -gt 0) {
    Write-Output ""
    Write-Output "RESULT: FAIL ($($failed.Count) of $($results.Count) checks failed)"
    exit 1
} else {
    Write-Output ""
    Write-Output "RESULT: PASS (all checks passed)"
    exit 0
}
