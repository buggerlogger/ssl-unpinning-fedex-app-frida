# ssl-unpinning-fedex-app-frida
🛠️ Advanced Android reverse engineering toolkit for the FedEx App. Features full SSL Unpinning, Emulator/Root detection evasion, and native libc.so memory filtering using Frida


![Bypass Success](/photo_2026-04-09_22-01-59.jpg)

**Author:** [@L0ed0_backup](https://t.me/L0ed0_backup)

This repository contains a comprehensive Frida instrumentation script used to completely defeat and bypass the multi-layered security architecture (Root, Emulator, and Instrumentation detection) integrated within the **FedEx Mobile Android App**. 

The application utilizes multiple aggressive commercial bot-protection suites, including:
- **Dynatrace** (Java-based Root/Tamper Detection)
- **ForgeRock** (Java & JNI Native Root Detection via `libtool-file.so`)
- **ThreatMetrix** (`libTMXProfiling-rl-7.7-71-jni.so` Native OS Fingerprinting)
- **Akamai Bot Manager Premier** (`libakamaibmp.so` Memory & Frida Detection)

## 🧠 The Mechanics & Algorithm

Most standard Frida scripts fail to bypass FedEx because they only hook the Java layer (`java.io.File`). However, ThreatMetrix and Akamai natively invoke foundational `libc.so` functions (`fopen`, `open`, `access`, `stat`) via JNI to read the underlying operating system state and memory mappings bypassing Java entirely.

If these native libraries scan `/proc/self/maps` and detect `frida-agent` or `magisk` loaded in memory, they silently flag the device session as compromised, leading the main app to instantly revoke access:
> *"App access has been revoked and your data reset due to detection of a rooted device."*

### 🛠️ The Bypass Strategy

#### 1. Java Layer Neutering (ForgeRock & Dynatrace)
We hook the known Java classes utilizing standard `Java.perform()` and force them to return clean device footprints:
- `com.dynatrace.agent.util.RootDetector.isDeviceRooted()` $\rightarrow$ `false`
- `org.forgerock.android.auth.detector` $\rightarrow$ `return 0.0`
- Block Java `File.exists()` lookups for common `/su` and `magisk` paths.

#### 2. Native Layer Deep Interception (ThreatMetrix & Akamai)
We use `Process.getModuleByName("libc.so").findExportByName(...)` to hook the `onEnter` parameters for low-level system calls:
* `fopen`, `open`, `openat`
* `access`, `faccessat`
* `stat`, `lstat`

When any argument corresponding to a file path points to a sensitive target (e.g., `/proc/self/maps`, `/system/app/magisk.apk`, or Frida instances), we rewrite the pointer dynamically in memory to `/nonexistent_path_bypassed`, forcing the native security module to cleanly handle an `ENOENT` (File Not Found) exception.

#### 3. Solving The "Chrome WebView Crash" Problem (Smart Memory Filtering)
A major hurdle in native bypasses is that **Chromium/WebView** (the core engine used by Android apps to display login pages) absolutely *requires* the ability to read `/proc/self/maps` to construct its security sandbox constraints. Completely blocking access to `maps` causes WebView to instantly abort the process (`SIGABRT`), thereby crashing FedEx.

**Our Algorithm:**
To bypass security without breaking WebView, we perform **Caller Address Resolution**. Inside the native hook, we check the memory address of the calling function:
```javascript
let mod = Process.findModuleByAddress(this.returnAddress);
let mName = mod.name.toLowerCase();
```
- If the caller module is `libTMXProfiling` or `libakamaibmp` $\rightarrow$ **Blocked**
- If the caller module is `libwebviewchromium.so` (or unrecognized system Core) $\rightarrow$ **Permitted**

This smart-filtering grants the app the memory access it needs to run while blinding the anti-bot agents.

## 📝 Execution Logs

```text
Spawning `com.fedex.ida.android`...
==========================================
   FedEx Custom Root & Emulator Bypass
==========================================
[*] Injecting Native (libc) Hooks for ThreatMetrix...
[DEBUG] Hooking fopen...
[DEBUG] Hooking access...
[DEBUG] Hooking faccessat...
[DEBUG] Hooking open...
[DEBUG] Hooking openat...
[DEBUG] Hooking stat/lstat...
[*] Root, Emulator & Native ThreatMetrix Bypass Injection Completed!
Spawned `com.fedex.ida.android`. Resuming main thread!
[Android Emulator 5554::com.fedex.ida.android ]-> [*] Injecting ForgeRock & Dynatrace Hooks...
[*] Root & Emulator Bypass Injection Completed!
[+] Blocked Java File check for: /system/app/superuser.apk
[+] Bypassed Dynatrace isDeviceRooted() -> false
[+] Bypassed ForgeRock isRooted() -> 0.0
[+] Native Blocked faccessat: /data/local/tmp/libfrida.so
[+] Native Blocked faccessat: /proc/self/maps
[+] Native Blocked fopen: /proc/self/maps
```

*By correctly executing this pipeline, the FedEx App stabilizes completely on a rooted environment alongside active Frida instrumentation.*
