<#
.SYNOPSIS
    Links OpsNow's .claude/ directory to a local checkout of the shared
    AI-Software-Team framework, without duplicating its files into this
    repository or hard-coding an absolute path into tracked config.

.DESCRIPTION
    OpsNow's Claude Code engineering framework (agent roles, engineering
    rules, workflow skills) is maintained in a separate repository and
    consumed here via local Windows directory junctions:

        .claude/framework -> TeamPath
        .claude/agents    -> TeamPath\.claude\agents
        .claude/rules     -> TeamPath\.claude\rules
        .claude/skills    -> TeamPath\.claude\skills

    CLAUDE.md imports the framework's own constitution through the stable
    relative path @.claude/framework/CLAUDE.md, so the tracked project
    config never hard-codes any developer's local TeamPath -- only this
    script's default parameter value does, and -TeamPath overrides it.

    This script creates .claude/ itself if a fresh checkout doesn't have
    it (it's gitignored, so a clone normally won't), then creates or
    repairs the four junctions above. It never copies framework files into
    OpsNow, never touches Git, never overwrites a real directory, and is
    safe to run repeatedly.

    Directory junctions (not symbolic links) are used deliberately: creating
    a real Windows directory symbolic link requires Administrator privilege
    or Developer Mode enabled, while a junction needs neither and behaves
    identically for this purpose (a live, local, read-through link). A
    TeamPath containing spaces is fine -- CLAUDE.md never imports it
    directly, only the space-free local .claude/framework link.

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

$results = [System.Collections.Generic.List[object]]::new()

function Add-Result($Name, $Pass, $Detail) {
    $results.Add([pscustomobject]@{ Name = $Name; Pass = $Pass; Detail = $Detail })
    $status = if ($Pass) { "PASS" } else { "FAIL" }
    Write-Output "$status  $Name -- $Detail"
}

# Creates or repairs a single junction at $LinkPath pointing to $TargetPath.
# Never touches a path that isn't a reparse point (real directories/files
# are developer content and are always left alone). Idempotent: if the
# link already points at the right place, it's left untouched.
function Set-FrameworkJunction($Name, $LinkPath, $TargetPath) {
    if (Test-Path -LiteralPath $LinkPath) {
        $item = Get-Item -LiteralPath $LinkPath -Force
        $isReparsePoint = ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0

        if (-not $isReparsePoint) {
            Add-Result $Name $false "Refusing to touch: $LinkPath is a real directory/file, not a link"
            return
        }

        $currentTarget = $null
        try {
            $raw = fsutil reparsepoint query $LinkPath 2>$null
            $line = $raw | Select-String "Substitute Name:\s*\\\?\?\\(.+)$"
            if ($line) { $currentTarget = $line.Matches[0].Groups[1].Value }
        } catch { }

        if ($currentTarget -and ($currentTarget.TrimEnd('\') -ieq $TargetPath.TrimEnd('\'))) {
            Add-Result $Name $true "Already correctly linked -> $TargetPath"
            return
        }

        # Stale/broken/pointing elsewhere: replace the link object only.
        # [System.IO.Directory]::Delete($path, $false) removes just the
        # reparse point, never the target's contents, and (unlike
        # Remove-Item) never raises PowerShell's unsuppressible "item has
        # children" confirmation prompt in a non-interactive host.
        [System.IO.Directory]::Delete($LinkPath, $false)
    }

    try {
        New-Item -ItemType Junction -Path $LinkPath -Target $TargetPath -ErrorAction Stop | Out-Null
    } catch {
        Add-Result $Name $false "Failed to create junction: $($_.Exception.Message)"
        return
    }

    $resolved = Test-Path -LiteralPath $LinkPath -PathType Container
    $childCount = 0
    if ($resolved) {
        $childCount = (Get-ChildItem -LiteralPath $LinkPath -Force -ErrorAction SilentlyContinue | Measure-Object).Count
    }

    if ($resolved -and $childCount -gt 0) {
        Add-Result $Name $true "Linked and resolves -> $TargetPath ($childCount entries)"
    } else {
        Add-Result $Name $false "Created but does not resolve to readable content -> $TargetPath"
    }
}

Write-Output "OpsNow AI-team setup"
Write-Output "  Team source : $TeamPath"
Write-Output "  OpsNow repo : $RepoRoot"
Write-Output ""

# --- 1. Validate the team source -------------------------------------------

if (-not (Test-Path -LiteralPath $TeamPath -PathType Container)) {
    Add-Result "TeamPath exists" $false "Not found: $TeamPath"
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
    exit 1
}
Add-Result "TeamPath structure" $true "CLAUDE.md, .claude\agents, .claude\rules, .claude\skills all present"

# --- 2. Ensure OpsNow's .claude directory exists ----------------------------
#
# .claude/ is gitignored and no longer has any tracked entries, so a fresh
# checkout normally won't have it at all. Create it as a plain local
# directory in that case. If something unexpected is already there (a file,
# or -- surprisingly -- a reparse point of its own), stop rather than guess.

if (-not (Test-Path -LiteralPath $ClaudeDir)) {
    New-Item -ItemType Directory -Path $ClaudeDir -Force | Out-Null
    Add-Result ".claude directory" $true "Created (fresh checkout): $ClaudeDir"
} else {
    $claudeItem = Get-Item -LiteralPath $ClaudeDir -Force
    $claudeIsReparsePoint = ($claudeItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0
    $claudeIsContainer = Test-Path -LiteralPath $ClaudeDir -PathType Container

    if ($claudeIsReparsePoint -or -not $claudeIsContainer) {
        Add-Result ".claude directory" $false "$ClaudeDir is not a normal local directory (file or link) -- refusing to touch it"
        Write-Output ""
        Write-Output "Cannot continue: .claude must be an ordinary local directory."
        exit 1
    }
    Add-Result ".claude directory" $true "Already exists: $ClaudeDir"
}

# --- 3. Link framework/agents/rules/skills ----------------------------------

Set-FrameworkJunction "framework" (Join-Path $ClaudeDir "framework") $TeamPath
Set-FrameworkJunction "agents"    (Join-Path $ClaudeDir "agents")    (Join-Path $TeamPath ".claude\agents")
Set-FrameworkJunction "rules"     (Join-Path $ClaudeDir "rules")     (Join-Path $TeamPath ".claude\rules")
Set-FrameworkJunction "skills"    (Join-Path $ClaudeDir "skills")    (Join-Path $TeamPath ".claude\skills")

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
