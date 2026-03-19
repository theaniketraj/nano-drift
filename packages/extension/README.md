# Nano Drift

Android development at your own pace inside VS Code.

Nano Drift helps you build, deploy, and mirror your Android device directly from the editor, so you can iterate quickly without leaving your coding workflow.

## What You Can Do

- Run and deploy your app with Run on the Fly
- Pick an active device from connected hardware and emulators
- Start an Android emulator from VS Code
- Connect physical devices over Wi-Fi
- Mirror and control a device in the Device Screen view

## Quick Start

1. Install Android SDK and ensure adb works from terminal.
2. Open VS Code Settings and set `nanoDrift.androidHome` if `ANDROID_HOME` is not set.
3. Open your Android project folder.
4. Run `Nano Drift: Sign in with GitHub`.
5. Run `Nano Drift: Select Active Device`.
6. Run `Android: Run on the Fly`.

## First-Time Onboarding

On first activation, Nano Drift shows a welcome prompt with:

- Get Started
- Sign in with GitHub

You can always re-open guidance with:

- `Nano Drift: Get Started`

## Commands

- `Android: Run on the Fly`
- `Android: Select Active Device`
- `Android: Start Headless Emulator`
- `Android: Connect Device over Wi-Fi`
- `Android: Focus Device Screen`
- `Android: List Connected Devices`
- `Android: Stop Daemon`
- `Nano Drift: Get Started`
- `Nano Drift: Sign in with GitHub`

## Configuration

- `nanoDrift.androidHome`: Path to Android SDK root
- `nanoDrift.daemonPort`: WebSocket port used by daemon
- `nanoDrift.autoRunOnSave`: Auto build/deploy on file save
- `nanoDrift.gradleArgs`: Extra Gradle arguments
- `nanoDrift.buildVariant`: Build variant (`debug`, `release`, etc.)
- `nanoDrift.packageName`: Android app package override
- `nanoDrift.streamCodec`: Device stream codec (`png` or `h264`)

## Troubleshooting

- If SDK warning appears, set `nanoDrift.androidHome` in settings.
- If no devices are shown, verify `adb devices` output.
- If deploy fails, open Nano Drift output and check Gradle/ADB logs.

## Links

- [Homepage](https://theaniketraj.github.io/nano-drift)
- [Issues](https://github.com/theaniketraj/nano-drift/issues)
- [Repository](https://github.com/theaniketraj/nano-drift)
