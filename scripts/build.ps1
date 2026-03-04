param(
    [string]$BuildDir = "build"
)

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$buildPath = Join-Path $root $BuildDir

cmake -S $root -B $buildPath
cmake --build $buildPath --config Release
