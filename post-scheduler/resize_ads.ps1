# Resize Ads for Each Social Platform
# ------------------------------------------------------------
# This PowerShell script scans the folder "C:\Users\josho\Downloads\Video"
# for video files and creates platform‑specific resized copies using ffmpeg.
#
# Prerequisites:
#   • ffmpeg must be installed and available in the system PATH.
#   • PowerShell 7+ (the environment you are using).
#   • Adding ffmpeg path for this session.
$env:PATH = "C:\ffmpeg\ffmpeg-9.0.1-essentials_build\bin;" + $env:PATH
#   • ffmpeg must be installed and available in the system PATH.
#   • PowerShell 7+ (the environment you are using).
#
# Platforms and recommended dimensions (width x height in pixels):
#   Instagram Feed          : 1080x1080
#   Instagram Stories/Reels: 1080x1920
#   TikTok                  : 1080x1920
#   Facebook Feed           : 1200x628
#   Twitter                 : 1280x720
#   LinkedIn                : 1200x627
#   YouTube (Standard)     : 1920x1080
#
# The script creates a sub‑folder for each platform under
# "C:\Users\josho\Downloads\Video\resized" and writes the
# resized files there, preserving the original filename with a suffix.
# ------------------------------------------------------------

# Define source and destination base folders
$sourceFolder = "C:\Users\josho\Downloads\Video"
$destBase    = Join-Path $sourceFolder "resized"

# Platform definitions (name => "WIDTHxHEIGHT")
$platforms = @{
    "instagram_feed"      = "1080x1080"
    "instagram_story"     = "1080x1920"
    "tiktok"             = "1080x1920"
    "facebook_feed"      = "1200x628"
    "twitter"            = "1280x720"
    "linkedin"           = "1200x628"
    "youtube"            = "1920x1080"
}

# Ensure destination root exists
if (-not (Test-Path -LiteralPath $destBase)) {
    New-Item -ItemType Directory -Path $destBase | Out-Null
}

# Helper to run ffmpeg and capture errors
function Invoke-Resize($inputPath, $outputPath, $size) {
    $ffmpegArgs = "-i `"$inputPath`" -vf scale=$size -c:a copy `"$outputPath`" -y"
    Write-Host "Resizing to $size -> $outputPath"
    $process = Start-Process -FilePath "ffmpeg" -ArgumentList $ffmpegArgs -NoNewWindow -Wait -PassThru
    if ($process.ExitCode -ne 0) {
        Write-Warning "ffmpeg failed for $inputPath (exit code $($process.ExitCode))"
    }
}

# Enumerate video files (common extensions)
$videoExtensions = @("*.mp4", "*.mov", "*.avi", "*.mkv")
$videoFiles = Get-ChildItem -Path $sourceFolder -Include $videoExtensions -File -Recurse

foreach ($file in $videoFiles) {
    foreach ($platform in $platforms.Keys) {
        $size = $platforms[$platform]
        $platformFolder = Join-Path $destBase $platform
        if (-not (Test-Path -LiteralPath $platformFolder)) {
            New-Item -ItemType Directory -Path $platformFolder | Out-Null
        }
        $outputName = "{0}_{1}{2}" -f $file.BaseName, $platform, $file.Extension
        $outputPath = Join-Path $platformFolder $outputName
        Invoke-Resize -inputPath $file.FullName -outputPath $outputPath -size $size
    }
}

Write-Host "All resizing jobs completed. Resized files are in $destBase"